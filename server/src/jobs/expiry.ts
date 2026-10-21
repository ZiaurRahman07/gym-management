import { execute, query, queryOne } from '../db/pool';

type ExpiringRow = {
  subscriptionId: number;
  memberId: number;
  endDate: string;
  daysLeft: number;
  firstName: string;
  lastName: string;
};

export type ExpiryJobResult = {
  expired: number;
  alertsCreated: number;
  leadDays: number;
};

/**
 * Marks lapsed memberships as expired and raises in-app alerts for memberships
 * that are inside the configured alert window. Alerts are raised on the lead
 * day plus the 7/3/1 day milestones, and deduplicated by a unique
 * (subscription_id, type) index so the job is safe to re-run.
 */
export async function runExpiryJob(): Promise<ExpiryJobResult> {
  const setting = await queryOne<{ value: string }>('SELECT "value" FROM settings WHERE "key" = ?', [
    'alert_lead_days',
  ]);
  const leadDays = Math.min(60, Math.max(1, Number(setting?.value) || 7));

  const expired = await execute(
    `UPDATE subscriptions SET status = 'expired'
     WHERE status = 'active' AND end_date < CURRENT_DATE`,
  );

  const milestones = [...new Set([leadDays, 7, 3, 1].filter((days) => days <= leadDays))].sort((a, b) => b - a);
  const placeholders = milestones.map(() => '?').join(', ');

  const expiring = await query<ExpiringRow>(
    `SELECT s.id AS "subscriptionId", s.member_id AS "memberId", s.end_date AS "endDate",
            (s.end_date - CURRENT_DATE) AS "daysLeft",
            m.first_name AS "firstName", m.last_name AS "lastName"
     FROM subscriptions s
     JOIN members m ON m.id = s.member_id
     WHERE s.status = 'active'
       AND m.deleted_at IS NULL
       AND m.status = 'active'
       AND (s.end_date - CURRENT_DATE) IN (${placeholders})`,
    milestones,
  );

  let alertsCreated = 0;
  for (const row of expiring) {
    const days = Number(row.daysLeft);
    const label = days === 1 ? 'tomorrow' : `in ${days} days`;
    const result = await execute(
      `INSERT INTO notifications (member_id, subscription_id, type, title, body)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (subscription_id, type) DO NOTHING`,
      [
        row.memberId,
        row.subscriptionId,
        `expiry_${days}`,
        days === leadDays ? 'Membership renewal due' : `Membership expires ${label}`,
        `${row.firstName} ${row.lastName}'s membership ends on ${String(row.endDate).slice(0, 10)}.`,
      ],
    );
    alertsCreated += result.affectedRows;
  }

  return { expired: expired.affectedRows, alertsCreated, leadDays };
}
