import type { ResultSetHeader } from 'mysql2/promise';
import { txExecute, txOne, type Conn } from '../db/pool';
import { badRequest, conflict, notFound } from '../lib/errors';
import { addDays, round2, toDateStr, toSqlDateTime, todayStr } from '../lib/helpers';

export type PaymentMethod = 'cash' | 'card' | 'bank' | 'online';

export type PaymentInput = {
  memberId: number;
  subscriptionId?: number | null;
  amount: number;
  method: PaymentMethod;
  paidAt?: string | null;
  notes?: string | null;
  recordedBy?: number | null;
};

export type SubscriptionInput = {
  memberId: number;
  planId: number;
  startDate?: string | null;
  discount?: number;
  notes?: string | null;
  payment?: {
    amount?: number;
    method: PaymentMethod;
    paidAt?: string | null;
    notes?: string | null;
  } | null;
  comp?: boolean;
  actorId?: number | null;
};

export async function createPaymentTx(conn: Conn, input: PaymentInput): Promise<{ id: number; invoiceNo: string }> {
  if (!input.amount || input.amount <= 0) {
    throw badRequest('Payment amount must be greater than zero.');
  }

  const member = await txOne<{ id: number }>(conn, 'SELECT id FROM members WHERE id = ? AND deleted_at IS NULL', [
    input.memberId,
  ]);
  if (!member) throw notFound('Member not found.');

  const placeholder = `TMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const result = await txExecute(
    conn,
    `INSERT INTO payments (invoice_no, member_id, subscription_id, amount, method, status, paid_at, notes, recorded_by)
     VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?)`,
    [
      placeholder,
      input.memberId,
      input.subscriptionId ?? null,
      round2(input.amount),
      input.method,
      toSqlDateTime(input.paidAt),
      input.notes ?? null,
      input.recordedBy ?? null,
    ],
  );

  const paidAt = toSqlDateTime(input.paidAt);
  const invoiceNo = `INV-${paidAt.slice(0, 7).replace('-', '')}-${String(result.insertId).padStart(5, '0')}`;
  await txExecute(conn, 'UPDATE payments SET invoice_no = ? WHERE id = ?', [invoiceNo, result.insertId]);

  return { id: result.insertId, invoiceNo };
}

export async function createSubscriptionTx(
  conn: Conn,
  input: SubscriptionInput,
): Promise<{ subscriptionId: number; paymentId: number | null; startDate: string; endDate: string; finalAmount: number }> {
  const member = await txOne<{ id: number; status: string; first_name: string; last_name: string }>(
    conn,
    'SELECT id, status, first_name, last_name FROM members WHERE id = ? AND deleted_at IS NULL',
    [input.memberId],
  );
  if (!member) throw notFound('Member not found.');
  if (member.status === 'blocked') throw badRequest('This member is blocked and cannot purchase a membership.');

  const plan = await txOne<{ id: number; name: string; duration_days: number; price: number; is_active: number }>(
    conn,
    'SELECT id, name, duration_days, price, is_active FROM plans WHERE id = ?',
    [input.planId],
  );
  if (!plan) throw notFound('Membership plan not found.');
  if (!plan.is_active) throw badRequest('This membership plan is no longer available.');

  const existing = await txOne<{ id: number; end_date: string; status: string }>(
    conn,
    `SELECT id, end_date, status FROM subscriptions
     WHERE member_id = ? AND (status = 'active' AND end_date >= CURDATE() OR status = 'frozen')
     ORDER BY end_date DESC LIMIT 1`,
    [input.memberId],
  );

  const startDate = input.startDate || (existing ? addDays(existing.end_date, 1) : todayStr());

  if (existing && existing.status === 'active' && startDate <= existing.end_date) {
    throw conflict(
      `This member already has an active membership until ${existing.end_date}. The new membership must start after that date.`,
    );
  }
  if (existing && existing.status === 'frozen' && startDate <= existing.end_date) {
    throw conflict('This member has a frozen membership. Unfreeze it before starting a new membership.');
  }

  const price = Number(plan.price);
  const discount = Math.max(0, Number(input.discount ?? 0));
  if (discount > price) throw badRequest('Discount cannot be greater than the plan price.');

  const finalAmount = round2(price - discount);
  const endDate = addDays(startDate, plan.duration_days - 1);

  const result = await txExecute(
    conn,
    `INSERT INTO subscriptions
      (member_id, plan_id, start_date, end_date, status, price_at_purchase, discount, final_amount, notes, created_by)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      input.memberId,
      input.planId,
      startDate,
      endDate,
      price,
      round2(discount),
      finalAmount,
      input.notes ?? null,
      input.actorId ?? null,
    ],
  );

  let paymentId: number | null = null;
  if (!input.comp && input.payment) {
    const payment = await createPaymentTx(conn, {
      memberId: input.memberId,
      subscriptionId: result.insertId,
      amount: input.payment.amount ?? finalAmount,
      method: input.payment.method,
      paidAt: input.payment.paidAt,
      notes: input.payment.notes ?? `Membership — ${plan.name}`,
      recordedBy: input.actorId,
    });
    paymentId = payment.id;
  }

  return { subscriptionId: result.insertId, paymentId, startDate, endDate, finalAmount };
}

export async function cancelSubscriptionTx(conn: Conn, id: number): Promise<void> {
  const sub = await txOne<{ status: string }>(conn, 'SELECT status FROM subscriptions WHERE id = ?', [id]);
  if (!sub) throw notFound('Membership not found.');
  if (sub.status === 'cancelled') throw badRequest('This membership is already cancelled.');
  await txExecute(conn, `UPDATE subscriptions SET status = 'cancelled', frozen_at = NULL WHERE id = ?`, [id]);
}

export async function freezeSubscriptionTx(conn: Conn, id: number): Promise<void> {
  const sub = await txOne<{ status: string; end_date: string }>(
    conn,
    'SELECT status, end_date FROM subscriptions WHERE id = ?',
    [id],
  );
  if (!sub) throw notFound('Membership not found.');
  if (sub.status !== 'active') throw badRequest('Only active memberships can be frozen.');
  if (sub.end_date < todayStr()) throw badRequest('This membership has already expired.');
  await txExecute(conn, `UPDATE subscriptions SET status = 'frozen', frozen_at = NOW() WHERE id = ?`, [id]);
}

export async function unfreezeSubscriptionTx(conn: Conn, id: number): Promise<void> {
  const sub = await txOne<{ status: string; frozen_at: string | null; end_date: string }>(
    conn,
    'SELECT status, frozen_at, end_date FROM subscriptions WHERE id = ?',
    [id],
  );
  if (!sub) throw notFound('Membership not found.');
  if (sub.status !== 'frozen') throw badRequest('This membership is not frozen.');

  const frozenAt = sub.frozen_at ? new Date(sub.frozen_at.replace(' ', 'T')) : new Date();
  const now = new Date();
  const frozenDays = Math.max(0, Math.ceil((now.getTime() - frozenAt.getTime()) / 86_400_000));
  const newEnd = addDays(sub.end_date, frozenDays);

  await txExecute(conn, `UPDATE subscriptions SET status = 'active', frozen_at = NULL, end_date = ? WHERE id = ?`, [
    newEnd,
    id,
  ]);
}

export function invoiceDate(date: Date = new Date()): string {
  return toDateStr(date);
}
