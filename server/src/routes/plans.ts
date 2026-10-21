import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/pool';
import { logAudit } from '../lib/audit';
import { conflict, notFound } from '../lib/errors';
import { asyncHandler, parseBody, parseId } from '../lib/helpers';
import { requireRole } from '../middleware/auth';

const router = Router();

const planSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required.').max(100),
  durationDays: z.coerce.number().int().min(1, 'Duration must be at least 1 day.').max(3650),
  price: z.coerce.number().min(0, 'Price cannot be negative.'),
  description: z.string().trim().max(255).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const rows = await query(
      `SELECT p.id, p.name, p.duration_days AS durationDays, p.price, p.description,
              p.is_active AS isActive, p.created_at AS createdAt,
              (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = p.id) AS subscriptionCount
       FROM plans p
       ${includeInactive ? '' : 'WHERE p.is_active = 1'}
       ORDER BY p.duration_days ASC, p.price ASC`,
    );
    res.json({ data: rows });
  }),
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = parseBody(planSchema, req.body);
    const existing = await queryOne('SELECT id FROM plans WHERE name = ?', [body.name]);
    if (existing) throw conflict('A plan with that name already exists.');

    const result = await execute(
      'INSERT INTO plans (name, duration_days, price, description, is_active) VALUES (?, ?, ?, ?, ?)',
      [body.name, body.durationDays, body.price, body.description ?? null, body.isActive === false ? 0 : 1],
    );
    await logAudit(req.user?.id, 'plan.create', 'plan', result.insertId, body);

    const plan = await queryOne(
      `SELECT id, name, duration_days AS durationDays, price, description, is_active AS isActive
       FROM plans WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({ data: plan });
  }),
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = parseBody(planSchema.partial(), req.body);

    const existing = await queryOne<{ id: number }>('SELECT id FROM plans WHERE id = ?', [id]);
    if (!existing) throw notFound('Plan not found.');

    if (body.name) {
      const duplicate = await queryOne('SELECT id FROM plans WHERE name = ? AND id <> ?', [body.name, id]);
      if (duplicate) throw conflict('A plan with that name already exists.');
    }

    const columns: Record<string, string> = {
      name: 'name',
      durationDays: 'duration_days',
      price: 'price',
      description: 'description',
      isActive: 'is_active',
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) {
      if (key in body) {
        sets.push(`${column} = ?`);
        const value = (body as Record<string, unknown>)[key];
        values.push(key === 'isActive' ? (value ? 1 : 0) : (value ?? null));
      }
    }

    if (sets.length) {
      values.push(id);
      await execute(`UPDATE plans SET ${sets.join(', ')} WHERE id = ?`, values);
      await logAudit(req.user?.id, 'plan.update', 'plan', id, body);
    }

    const plan = await queryOne(
      `SELECT id, name, duration_days AS durationDays, price, description, is_active AS isActive
       FROM plans WHERE id = ?`,
      [id],
    );
    res.json({ data: plan });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const plan = await queryOne<{ id: number }>('SELECT id FROM plans WHERE id = ?', [id]);
    if (!plan) throw notFound('Plan not found.');

    const used = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM subscriptions WHERE plan_id = ?', [id]);
    if (Number(used?.count) > 0) {
      await execute('UPDATE plans SET is_active = 0 WHERE id = ?', [id]);
      await logAudit(req.user?.id, 'plan.deactivate', 'plan', id);
      res.json({ ok: true, deactivated: true, message: 'This plan has subscriptions, so it was deactivated instead of deleted.' });
      return;
    }

    await execute('DELETE FROM plans WHERE id = ?', [id]);
    await logAudit(req.user?.id, 'plan.delete', 'plan', id);
    res.json({ ok: true });
  }),
);

export default router;
