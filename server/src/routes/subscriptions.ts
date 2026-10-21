import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../db/pool';
import { logAudit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { asyncHandler, getPagination, like, paged, parseBody, parseId } from '../lib/helpers';
import { requireRole } from '../middleware/auth';
import {
  cancelSubscriptionTx,
  createSubscriptionTx,
  freezeSubscriptionTx,
  unfreezeSubscriptionTx,
} from '../services/billing';

const router = Router();

const SUB_SELECT = `
  s.id, s.member_id AS memberId, s.plan_id AS planId,
  s.start_date AS startDate, s.end_date AS endDate, s.status,
  s.price_at_purchase AS price, s.discount, s.final_amount AS finalAmount,
  s.frozen_at AS frozenAt, s.notes, s.created_at AS createdAt,
  m.member_code AS memberCode, m.first_name AS firstName, m.last_name AS lastName, m.phone,
  p.name AS planName, p.duration_days AS durationDays,
  DATEDIFF(s.end_date, CURDATE()) AS daysLeft,
  (SELECT COALESCE(SUM(pay.amount), 0) FROM payments pay
   WHERE pay.subscription_id = s.id AND pay.status = 'paid') AS amountPaid
`;

const SUB_FROM = `
  FROM subscriptions s
  JOIN members m ON m.id = s.member_id
  JOIN plans p ON p.id = s.plan_id
`;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.');

const createSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive(),
  startDate: dateString.optional(),
  discount: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(255).nullable().optional(),
  comp: z.boolean().optional(),
  payment: z
    .object({
      amount: z.coerce.number().min(0).optional(),
      method: z.enum(['cash', 'card', 'bank', 'online']),
      paidAt: z.string().min(10).max(19).optional().nullable(),
      notes: z.string().trim().max(255).nullable().optional(),
    })
    .nullable()
    .optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req);
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const memberId = Number(req.query.memberId) || 0;
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();

    const where: string[] = ['m.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (q) {
      where.push('(m.member_code LIKE ? OR m.first_name LIKE ? OR m.last_name LIKE ? OR m.phone LIKE ?)');
      const term = like(q);
      params.push(term, term, term, term);
    }
    if (status && ['active', 'expired', 'frozen', 'cancelled'].includes(status)) {
      where.push('s.status = ?');
      params.push(status);
    }
    if (memberId) {
      where.push('s.member_id = ?');
      params.push(memberId);
    }
    if (from) {
      where.push('s.start_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('s.start_date <= ?');
      params.push(to);
    }

    const clause = `WHERE ${where.join(' AND ')}`;
    const rows = await query(
      `SELECT ${SUB_SELECT} ${SUB_FROM} ${clause} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const countRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS total ${SUB_FROM} ${clause}`, params);

    res.json(paged(rows, Number(countRow?.total ?? 0), page, limit));
  }),
);

router.get(
  '/expiring',
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    const rows = await query(
      `SELECT ${SUB_SELECT} ${SUB_FROM}
       WHERE s.status = 'active' AND m.deleted_at IS NULL AND m.status = 'active'
         AND s.end_date >= CURDATE() AND s.end_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY s.end_date ASC`,
      [days],
    );
    res.json({ data: rows, days });
  }),
);

router.post(
  '/',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const body = parseBody(createSchema, req.body);

    const result = await withTransaction((conn) =>
      createSubscriptionTx(conn, {
        memberId: body.memberId,
        planId: body.planId,
        startDate: body.startDate,
        discount: body.discount,
        notes: body.notes,
        comp: body.comp,
        payment: body.payment ?? null,
        actorId: req.user?.id,
      }),
    );

    await logAudit(req.user?.id, 'subscription.create', 'subscription', result.subscriptionId, result);
    const created = await queryOne(`SELECT ${SUB_SELECT} ${SUB_FROM} WHERE s.id = ?`, [result.subscriptionId]);
    res.status(201).json({ data: created, paymentId: result.paymentId });
  }),
);

router.patch(
  '/:id',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = parseBody(z.object({ action: z.enum(['freeze', 'unfreeze', 'cancel']) }), req.body);

    const existing = await queryOne<{ id: number }>('SELECT id FROM subscriptions WHERE id = ?', [id]);
    if (!existing) throw notFound('Membership not found.');

    await withTransaction(async (conn) => {
      if (body.action === 'freeze') await freezeSubscriptionTx(conn, id);
      if (body.action === 'unfreeze') await unfreezeSubscriptionTx(conn, id);
      if (body.action === 'cancel') await cancelSubscriptionTx(conn, id);
    });

    await logAudit(req.user?.id, `subscription.${body.action}`, 'subscription', id);
    const updated = await queryOne(`SELECT ${SUB_SELECT} ${SUB_FROM} WHERE s.id = ?`, [id]);
    res.json({ data: updated });
  }),
);

export default router;
