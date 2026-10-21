import { Router } from 'express';
import { query, queryOne } from '../db/pool';
import { asyncHandler, todayStr } from '../lib/helpers';

const router = Router();

function lastMonths(count: number) {
  const months: { key: string; label: string }[] = [];
  const [year, month] = todayStr().split('-').map(Number);
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - i, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) });
  }
  return months;
}

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const setting = await queryOne<{ value: string }>('SELECT "value" FROM settings WHERE "key" = ?', [
      'alert_lead_days',
    ]);
    const leadDays = Math.min(60, Math.max(1, Number(setting?.value) || 7));

    const [breakdownRows, revenueSeriesRows, monthRevenue, lastMonthRevenue, recentPayments, expiringList, counters, newMembers] =
      await Promise.all([
        query<{ status: string; count: number }>(
          `SELECT t."membershipStatus" AS "status", COUNT(*) AS "count" FROM (
             SELECT CASE
               WHEN m.status <> 'active' THEN 'inactive'
               WHEN s.id IS NULL THEN 'none'
               WHEN s.status = 'frozen' THEN 'frozen'
               WHEN s.status = 'cancelled' THEN 'cancelled'
               WHEN s.end_date < CURRENT_DATE THEN 'expired'
               WHEN (s.end_date - CURRENT_DATE) <= ? THEN 'expiring'
               ELSE 'active'
             END AS "membershipStatus"
             FROM members m
             LEFT JOIN subscriptions s ON s.id = (
               SELECT s2.id FROM subscriptions s2 WHERE s2.member_id = m.id
               ORDER BY (s2.status = 'active') DESC, s2.end_date DESC, s2.id DESC LIMIT 1
             )
             WHERE m.deleted_at IS NULL
           ) t GROUP BY t."membershipStatus"`,
          [leadDays],
        ),
        query<{ period: string; total: number }>(
          `SELECT to_char(paid_at, 'YYYY-MM') AS "period", COALESCE(SUM(amount), 0) AS "total"
           FROM payments
           WHERE status = 'paid' AND paid_at >= date_trunc('month', CURRENT_DATE - interval '11 months')
           GROUP BY period ORDER BY period`,
        ),
        queryOne<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS "total" FROM payments
           WHERE status = 'paid' AND paid_at >= date_trunc('month', CURRENT_DATE)::date`,
        ),
        queryOne<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS "total" FROM payments
           WHERE status = 'paid'
             AND paid_at >= date_trunc('month', CURRENT_DATE - interval '1 month')
             AND paid_at < date_trunc('month', CURRENT_DATE)::date`,
        ),
        query(
          `SELECT pay.id, pay.invoice_no AS "invoiceNo", pay.amount, pay.method, pay.status,
                  pay.paid_at AS "paidAt", m.id AS "memberId", m.member_code AS "memberCode",
                  m.first_name AS "firstName", m.last_name AS "lastName", m.photo_url AS "photoUrl"
           FROM payments pay JOIN members m ON m.id = pay.member_id
           ORDER BY pay.paid_at DESC, pay.id DESC LIMIT 6`,
        ),
        query(
          `SELECT m.id, m.member_code AS "memberCode", m.first_name AS "firstName", m.last_name AS "lastName",
                  m.phone, m.photo_url AS "photoUrl", s.end_date AS "endDate",
                  (s.end_date - CURRENT_DATE) AS "daysLeft", p.name AS "planName"
           FROM subscriptions s
           JOIN members m ON m.id = s.member_id
           JOIN plans p ON p.id = s.plan_id
           WHERE s.status = 'active' AND m.deleted_at IS NULL AND m.status = 'active'
             AND s.end_date >= CURRENT_DATE AND s.end_date <= (CURRENT_DATE + (?::int * interval '1 day'))
           ORDER BY s.end_date ASC LIMIT 8`,
          [leadDays],
        ),
        Promise.all([
          queryOne<{ count: number }>(
            `SELECT COUNT(*) AS "count" FROM attendance
             WHERE check_in_at >= CURRENT_DATE AND check_in_at < (CURRENT_DATE + interval '1 day')`,
          ),
          queryOne<{ count: number }>(
            `SELECT COUNT(*) AS "count" FROM attendance
             WHERE check_out_at IS NULL AND check_in_at >= CURRENT_DATE AND check_in_at < (CURRENT_DATE + interval '1 day')`,
          ),
          queryOne<{ count: number }>(
            `SELECT COUNT(*) AS "count" FROM members WHERE deleted_at IS NULL AND join_date >= date_trunc('month', CURRENT_DATE)::date`,
          ),
          queryOne<{ count: number }>('SELECT COUNT(*) AS "count" FROM members WHERE deleted_at IS NULL'),
        ]),
        query(
          `SELECT m.id, m.member_code AS "memberCode", m.first_name AS "firstName", m.last_name AS "lastName",
                  m.photo_url AS "photoUrl", m.join_date AS "joinDate", p.name AS "planName"
           FROM members m
           LEFT JOIN subscriptions s ON s.id = (
             SELECT s2.id FROM subscriptions s2 WHERE s2.member_id = m.id
             ORDER BY s2.end_date DESC, s2.id DESC LIMIT 1
           )
           LEFT JOIN plans p ON p.id = s.plan_id
           WHERE m.deleted_at IS NULL
           ORDER BY m.created_at DESC LIMIT 5`,
        ),
      ]);

    const breakdown: Record<string, number> = {
      active: 0,
      expiring: 0,
      expired: 0,
      none: 0,
      frozen: 0,
      cancelled: 0,
      inactive: 0,
    };
    for (const row of breakdownRows) breakdown[row.status] = Number(row.count);

    const months = lastMonths(12);
    const revenueMap = new Map(revenueSeriesRows.map((row) => [row.period, Number(row.total)]));
    const revenueSeries = months.map((month) => ({
      label: month.label,
      period: month.key,
      value: revenueMap.get(month.key) ?? 0,
    }));

    const thisMonth = Number(monthRevenue?.total ?? 0);
    const previous = Number(lastMonthRevenue?.total ?? 0);
    const revenueChangePct = previous === 0 ? (thisMonth > 0 ? 100 : 0) : Math.round(((thisMonth - previous) / previous) * 1000) / 10;

    const [todayCheckins, insideNow, newMembersThisMonth, totalMembers] = counters;

    res.json({
      data: {
        activeMembers: breakdown.active + breakdown.expiring,
        expiringSoon: breakdown.expiring,
        expiredMembers: breakdown.expired,
        totalMembers: Number(totalMembers?.count ?? 0),
        newMembersThisMonth: Number(newMembersThisMonth?.count ?? 0),
        todayCheckins: Number(todayCheckins?.count ?? 0),
        insideNow: Number(insideNow?.count ?? 0),
        monthRevenue: thisMonth,
        revenueChangePct,
        alertLeadDays: leadDays,
        revenueSeries,
        membershipBreakdown: breakdown,
        expiringList,
        recentPayments,
        recentMembers: newMembers,
      },
    });
  }),
);

export default router;
