import { Router, type Request } from 'express';
import { query, queryOne } from '../db/pool';
import { badRequest } from '../lib/errors';
import { asyncHandler, monthStart, toCsv, todayStr } from '../lib/helpers';

const router = Router();

type ReportName = 'revenue' | 'members' | 'attendance' | 'trainers';
const REPORTS: ReportName[] = ['revenue', 'members', 'attendance', 'trainers'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getRange(req: Request) {
  const from = DATE_RE.test(String(req.query.from)) ? String(req.query.from) : monthStart();
  const to = DATE_RE.test(String(req.query.to)) ? String(req.query.to) : todayStr();
  if (from > to) throw badRequest('The start date must be on or before the end date.');
  return { from, to };
}

async function revenueReport(req: Request) {
  const { from, to } = getRange(req);
  const groupBy = ['day', 'month', 'plan', 'method'].includes(String(req.query.groupBy))
    ? String(req.query.groupBy)
    : 'day';

  const where = [`pay.status = 'paid'`, '(pay.paid_at)::date BETWEEN ? AND ?'];
  const params: unknown[] = [from, to];

  const labelExpr =
    groupBy === 'month'
      ? `to_char(pay.paid_at, 'YYYY-MM')`
      : groupBy === 'plan'
        ? `COALESCE(pl.name, 'Other')`
        : groupBy === 'method'
          ? `pay.method`
          : `(pay.paid_at)::date`;

  const series = await query<{ label: string; value: number; count: number }>(
    `SELECT ${labelExpr} AS "label", COALESCE(SUM(pay.amount), 0) AS "value", COUNT(*) AS "count"
     FROM payments pay
     LEFT JOIN subscriptions s ON s.id = pay.subscription_id
     LEFT JOIN plans pl ON pl.id = s.plan_id
     WHERE ${where.join(' AND ')}
     GROUP BY label ORDER BY label ASC`,
    params,
  );

  const byMethod = await query<{ label: string; value: number; count: number }>(
    `SELECT pay.method AS "label", COALESCE(SUM(pay.amount), 0) AS "value", COUNT(*) AS "count"
     FROM payments pay WHERE ${where.join(' AND ')} GROUP BY pay.method ORDER BY value DESC`,
    params,
  );

  const byPlan = await query<{ label: string; value: number; count: number }>(
    `SELECT COALESCE(pl.name, 'Other') AS "label", COALESCE(SUM(pay.amount), 0) AS "value", COUNT(*) AS "count"
     FROM payments pay
     LEFT JOIN subscriptions s ON s.id = pay.subscription_id
     LEFT JOIN plans pl ON pl.id = s.plan_id
     WHERE ${where.join(' AND ')} GROUP BY label ORDER BY value DESC`,
    params,
  );

  const totals = await queryOne<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(pay.amount), 0) AS "total", COUNT(*) AS "count"
     FROM payments pay WHERE ${where.join(' AND ')}`,
    params,
  );

  return {
    from,
    to,
    groupBy,
    total: Number(totals?.total ?? 0),
    count: Number(totals?.count ?? 0),
    series: series.map((r) => ({ ...r, value: Number(r.value), count: Number(r.count) })),
    byMethod: byMethod.map((r) => ({ ...r, value: Number(r.value), count: Number(r.count) })),
    byPlan: byPlan.map((r) => ({ ...r, value: Number(r.value), count: Number(r.count) })),
  };
}

async function membersReport(req: Request) {
  const { from, to } = getRange(req);

  const [newMembers, totalMembers, activeNow, expiring, expiredInPeriod, churned, series] = await Promise.all([
    queryOne<{ count: number }>(
      'SELECT COUNT(*) AS "count" FROM members WHERE deleted_at IS NULL AND join_date BETWEEN ? AND ?',
      [from, to],
    ),
    queryOne<{ count: number }>('SELECT COUNT(*) AS "count" FROM members WHERE deleted_at IS NULL'),
    queryOne<{ count: number }>(
      `SELECT COUNT(DISTINCT s.member_id) AS "count" FROM subscriptions s
       JOIN members m ON m.id = s.member_id
       WHERE s.status = 'active' AND s.end_date >= CURRENT_DATE AND m.deleted_at IS NULL AND m.status = 'active'`,
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(DISTINCT s.member_id) AS "count" FROM subscriptions s
       JOIN members m ON m.id = s.member_id
       WHERE s.status = 'active' AND s.end_date >= CURRENT_DATE
         AND s.end_date <= (CURRENT_DATE + interval '7 days') AND m.deleted_at IS NULL`,
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS "count" FROM subscriptions
       WHERE status = 'expired' AND end_date BETWEEN ? AND ?`,
      [from, to],
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*) AS "count" FROM members m
       WHERE m.deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.member_id = m.id)
         AND NOT EXISTS (
           SELECT 1 FROM subscriptions s2 WHERE s2.member_id = m.id
             AND (s2.status = 'frozen' OR (s2.status = 'active' AND s2.end_date >= CURRENT_DATE))
         )`,
    ),
    query(
      `SELECT to_char(join_date, 'YYYY-MM') AS "label", COUNT(*) AS "value"
       FROM members WHERE deleted_at IS NULL AND join_date BETWEEN ? AND ?
       GROUP BY label ORDER BY label ASC`,
      [from, to],
    ),
  ]);

  return {
    from,
    to,
    newMembers: Number(newMembers?.count ?? 0),
    totalMembers: Number(totalMembers?.count ?? 0),
    activeNow: Number(activeNow?.count ?? 0),
    expiring: Number(expiring?.count ?? 0),
    expiredInPeriod: Number(expiredInPeriod?.count ?? 0),
    churned: Number(churned?.count ?? 0),
    series: series.map((r) => ({ label: r.label, value: Number(r.value) })),
  };
}

async function attendanceReport(req: Request) {
  const { from, to } = getRange(req);

  const [metrics, series, peakHours] = await Promise.all([
    queryOne<{ totalVisits: number; uniqueMembers: number; avgDuration: number }>(
      `SELECT COUNT(*) AS "totalVisits", COUNT(DISTINCT member_id) AS "uniqueMembers",
              COALESCE(AVG(CASE WHEN check_out_at IS NOT NULL THEN (extract(epoch from (check_out_at - check_in_at)) / 60) END), 0) AS "avgDuration"
       FROM attendance WHERE (check_in_at)::date BETWEEN ? AND ?`,
      [from, to],
    ),
    query(
      `SELECT (check_in_at)::date AS "label", COUNT(*) AS "value", COUNT(DISTINCT member_id) AS "uniqueMembers"
       FROM attendance WHERE (check_in_at)::date BETWEEN ? AND ?
       GROUP BY label ORDER BY label ASC`,
      [from, to],
    ),
    query(
      `SELECT extract(hour from check_in_at)::int AS "hour", COUNT(*) AS "value"
       FROM attendance WHERE (check_in_at)::date BETWEEN ? AND ?
       GROUP BY hour ORDER BY hour ASC`,
      [from, to],
    ),
  ]);

  return {
    from,
    to,
    totalVisits: Number(metrics?.totalVisits ?? 0),
    uniqueMembers: Number(metrics?.uniqueMembers ?? 0),
    avgDurationMinutes: Math.round(Number(metrics?.avgDuration ?? 0)),
    series: series.map((r) => ({ label: r.label, value: Number(r.value), uniqueMembers: Number(r.uniqueMembers) })),
    peakHours: peakHours.map((r) => ({ hour: Number(r.hour), value: Number(r.value) })),
  };
}

async function trainersReport(req: Request) {
  const { from, to } = getRange(req);

  const rows = await query<{
    id: number;
    name: string;
    specialization: string | null;
    status: string;
    assignedMembers: number;
    visits: number;
  }>(
    `SELECT t.id, t.name, t.specialization, t.status,
            (SELECT COUNT(*) FROM trainer_assignments a WHERE a.trainer_id = t.id AND a.ended_at IS NULL) AS "assignedMembers",
            (SELECT COUNT(*) FROM attendance at
             JOIN trainer_assignments a ON a.member_id = at.member_id AND a.trainer_id = t.id
             WHERE (at.check_in_at)::date BETWEEN ? AND ?
               AND (a.ended_at IS NULL OR a.ended_at >= (at.check_in_at)::date)) AS "visits"
     FROM trainers t
     WHERE t.status = 'active'
     ORDER BY t.name ASC`,
    [from, to],
  );

  const shaped = rows.map((row) => ({
    ...row,
    assignedMembers: Number(row.assignedMembers),
    visits: Number(row.visits),
  }));

  return {
    from,
    to,
    trainers: shaped,
    totalAssigned: shaped.reduce((sum, row) => sum + row.assignedMembers, 0),
    totalVisits: shaped.reduce((sum, row) => sum + row.visits, 0),
  };
}

async function buildReport(report: ReportName, req: Request) {
  if (report === 'revenue') return revenueReport(req);
  if (report === 'members') return membersReport(req);
  if (report === 'attendance') return attendanceReport(req);
  return trainersReport(req);
}

router.get(
  '/:report/export',
  asyncHandler(async (req, res) => {
    const report = req.params.report as ReportName;
    if (!REPORTS.includes(report)) throw badRequest('Unknown report.');

    const data = (await buildReport(report, req)) as Record<string, any>;
    let rows: Record<string, unknown>[] = [];
    let columns: { key: string; label: string }[] = [];

    if (report === 'revenue') {
      rows = data.series;
      columns = [
        { key: 'label', label: 'Period' },
        { key: 'value', label: 'Revenue' },
        { key: 'count', label: 'Payments' },
      ];
    } else if (report === 'members') {
      rows = data.series;
      columns = [
        { key: 'label', label: 'Month' },
        { key: 'value', label: 'New members' },
      ];
    } else if (report === 'attendance') {
      rows = data.series;
      columns = [
        { key: 'label', label: 'Date' },
        { key: 'value', label: 'Check-ins' },
        { key: 'uniqueMembers', label: 'Unique members' },
      ];
    } else {
      rows = data.trainers;
      columns = [
        { key: 'name', label: 'Trainer' },
        { key: 'specialization', label: 'Specialization' },
        { key: 'assignedMembers', label: 'Assigned members' },
        { key: 'visits', label: 'Member check-ins' },
      ];
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report}-${data.from}-to-${data.to}.csv"`);
    res.send(toCsv(rows, columns));
  }),
);

router.get(
  '/:report',
  asyncHandler(async (req, res) => {
    const report = req.params.report as ReportName;
    if (!REPORTS.includes(report)) throw badRequest('Unknown report.');
    res.json({ data: await buildReport(report, req) });
  }),
);

export default router;
