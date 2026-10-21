import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction } from '../db/pool';
import { logAudit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import { asyncHandler, getPagination, like, paged, parseBody, parseId } from '../lib/helpers';
import { requireRole } from '../middleware/auth';
import { createPaymentTx } from '../services/billing';

const router = Router();

const PAY_SELECT = `
  pay.id, pay.invoice_no AS "invoiceNo", pay.member_id AS "memberId", pay.subscription_id AS "subscriptionId",
  pay.amount, pay.method, pay.status, pay.paid_at AS "paidAt", pay.notes, pay.created_at AS "createdAt",
  m.member_code AS "memberCode", m.first_name AS "firstName", m.last_name AS "lastName", m.phone,
  p.name AS "planName", u.name AS "recordedByName"
`;

const PAY_FROM = `
  FROM payments pay
  JOIN members m ON m.id = pay.member_id
  LEFT JOIN subscriptions s ON s.id = pay.subscription_id
  LEFT JOIN plans p ON p.id = s.plan_id
  LEFT JOIN users u ON u.id = pay.recorded_by
`;

const paymentSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  subscriptionId: z.coerce.number().int().positive().nullable().optional(),
  amount: z.coerce.number().positive('Amount must be greater than zero.'),
  method: z.enum(['cash', 'card', 'bank', 'online']),
  paidAt: z.string().min(10).max(19).nullable().optional(),
  notes: z.string().trim().max(255).nullable().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req);
    const q = String(req.query.q ?? '').trim();
    const method = String(req.query.method ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const memberId = Number(req.query.memberId) || 0;
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();

    const where: string[] = [];
    const params: unknown[] = [];

    if (q) {
      where.push('(pay.invoice_no LIKE ? OR m.member_code LIKE ? OR m.first_name LIKE ? OR m.last_name LIKE ?)');
      const term = like(q);
      params.push(term, term, term, term);
    }
    if (method && ['cash', 'card', 'bank', 'online'].includes(method)) {
      where.push('pay.method = ?');
      params.push(method);
    }
    if (status && ['paid', 'pending', 'refunded', 'failed'].includes(status)) {
      where.push('pay.status = ?');
      params.push(status);
    }
    if (memberId) {
      where.push('pay.member_id = ?');
      params.push(memberId);
    }
    if (from) {
      where.push('(pay.paid_at)::date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('(pay.paid_at)::date <= ?');
      params.push(to);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await query(
      `SELECT ${PAY_SELECT} ${PAY_FROM} ${clause} ORDER BY pay.paid_at DESC, pay.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const countRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS "total" ${PAY_FROM} ${clause}`, params);
    const totals = await queryOne<{ paid: number; refunded: number }>(
      `SELECT COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) AS "paid",
              COALESCE(SUM(CASE WHEN pay.status = 'refunded' THEN pay.amount ELSE 0 END), 0) AS "refunded"
       ${PAY_FROM} ${clause}`,
      params,
    );

    res.json({
      ...paged(rows, Number(countRow?.total ?? 0), page, limit),
      summary: { paid: Number(totals?.paid ?? 0), refunded: Number(totals?.refunded ?? 0) },
    });
  }),
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const groupBy = ['day', 'month', 'plan', 'method'].includes(String(req.query.groupBy))
      ? String(req.query.groupBy)
      : 'day';

    const where = [`pay.status = 'paid'`];
    const params: unknown[] = [];
    if (from) {
      where.push('(pay.paid_at)::date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('(pay.paid_at)::date <= ?');
      params.push(to);
    }
    const clause = `WHERE ${where.join(' AND ')}`;

    const labelExpr =
      groupBy === 'month'
        ? `to_char(pay.paid_at, 'YYYY-MM')`
        : groupBy === 'plan'
          ? `COALESCE(p.name, 'Other')`
          : groupBy === 'method'
            ? `pay.method`
            : `(pay.paid_at)::date`;

    const series = await query<{ label: string; value: number; count: number }>(
      `SELECT ${labelExpr} AS "label", COALESCE(SUM(pay.amount), 0) AS "value", COUNT(*) AS "count"
       ${PAY_FROM} ${clause} GROUP BY label ORDER BY label ASC`,
      params,
    );
    const total = await queryOne<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(pay.amount), 0) AS "total", COUNT(*) AS "count" ${PAY_FROM} ${clause}`,
      params,
    );

    res.json({
      data: series.map((row) => ({ ...row, value: Number(row.value), count: Number(row.count) })),
      total: Number(total?.total ?? 0),
      count: Number(total?.count ?? 0),
      groupBy,
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const payment = await queryOne(`SELECT ${PAY_SELECT} ${PAY_FROM} WHERE pay.id = ?`, [id]);
    if (!payment) throw notFound('Payment not found.');
    res.json({ data: payment });
  }),
);

router.post(
  '/',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const body = parseBody(paymentSchema, req.body);

    if (body.subscriptionId) {
      const subscription = await queryOne<{ member_id: number }>(
        'SELECT member_id FROM subscriptions WHERE id = ?',
        [body.subscriptionId],
      );
      if (!subscription) throw notFound('Membership not found.');
      if (subscription.member_id !== body.memberId) {
        throw badRequest('That membership belongs to a different member.');
      }
    }

    const created = await withTransaction((conn) =>
      createPaymentTx(conn, {
        memberId: body.memberId,
        subscriptionId: body.subscriptionId ?? null,
        amount: body.amount,
        method: body.method,
        paidAt: body.paidAt,
        notes: body.notes,
        recordedBy: req.user?.id,
      }),
    );

    await logAudit(req.user?.id, 'payment.create', 'payment', created.id, { amount: body.amount });

    const payment = await queryOne(`SELECT ${PAY_SELECT} ${PAY_FROM} WHERE pay.id = ?`, [created.id]);
    res.status(201).json({ data: payment });
  }),
);

router.post(
  '/:id/refund',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = parseBody(z.object({ reason: z.string().trim().max(255).optional() }), req.body ?? {});

    const payment = await queryOne<{ id: number; status: string }>('SELECT id, status FROM payments WHERE id = ?', [id]);
    if (!payment) throw notFound('Payment not found.');
    if (payment.status !== 'paid') throw badRequest('Only completed payments can be refunded.');

    await execute(
      `UPDATE payments SET status = 'refunded', notes = COALESCE(notes, '') || ? WHERE id = ?`,
      [body.reason ? ` Refund reason: ${body.reason}` : ' Refunded.', id],
    );
    await logAudit(req.user?.id, 'payment.refund', 'payment', id, body);

    const updated = await queryOne(`SELECT ${PAY_SELECT} ${PAY_FROM} WHERE pay.id = ?`, [id]);
    res.json({ data: updated });
  }),
);

export default router;
