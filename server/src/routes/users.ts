import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/pool';
import { logAudit } from '../lib/audit';
import { badRequest, conflict, notFound } from '../lib/errors';
import { asyncHandler, parseBody, parseId } from '../lib/helpers';
import { requireRole } from '../middleware/auth';

const router = Router();

const baseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(190),
  role: z.enum(['admin', 'receptionist', 'trainer']),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

async function activeAdminCount(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = true`,
  );
  return Number(row?.count ?? 0);
}

router.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT id, name, email, role, is_active AS "isActive", created_at AS "createdAt" FROM users ORDER BY name`,
    );
    res.json({ data: rows });
  }),
);

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = parseBody(baseSchema, req.body);
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [body.email]);
    if (existing) throw conflict('A user with that email already exists.');

    const hash = await bcrypt.hash(body.password, 12);
    const result = await execute('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
      body.name,
      body.email,
      hash,
      body.role,
    ]);
    await logAudit(req.user?.id, 'user.create', 'user', result.insertId, { email: body.email, role: body.role });

    const user = await queryOne(
      'SELECT id, name, email, role, is_active AS "isActive", created_at AS "createdAt" FROM users WHERE id = ?',
      [result.insertId],
    );
    res.status(201).json({ data: user });
  }),
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = parseBody(
      z.object({
        name: z.string().trim().min(1).max(120).optional(),
        email: z.string().trim().toLowerCase().email().max(190).optional(),
        role: z.enum(['admin', 'receptionist', 'trainer']).optional(),
        password: z.string().min(8).optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );

    const user = await queryOne<{ id: number; role: string }>('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!user) throw notFound('User not found.');

    if (id === req.user?.id && (body.isActive === false || (body.role && body.role !== 'admin'))) {
      throw badRequest('You cannot deactivate or demote your own account.');
    }
    if (body.isActive === false && user.role === 'admin' && (await activeAdminCount()) <= 1) {
      throw badRequest('At least one active administrator is required.');
    }
    if (body.role && body.role !== 'admin' && user.role === 'admin' && (await activeAdminCount()) <= 1) {
      throw badRequest('At least one active administrator is required.');
    }

    if (body.email) {
      const duplicate = await queryOne('SELECT id FROM users WHERE email = ? AND id <> ?', [body.email, id]);
      if (duplicate) throw conflict('A user with that email already exists.');
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    if (body.name !== undefined) {
      sets.push('name = ?');
      values.push(body.name);
    }
    if (body.email !== undefined) {
      sets.push('email = ?');
      values.push(body.email);
    }
    if (body.role !== undefined) {
      sets.push('role = ?');
      values.push(body.role);
    }
    if (body.isActive !== undefined) {
      sets.push('is_active = ?');
      values.push(body.isActive);
    }
    if (body.password) {
      sets.push('password_hash = ?');
      values.push(await bcrypt.hash(body.password, 12));
    }

    if (sets.length) {
      values.push(id);
      await execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values);
      await logAudit(req.user?.id, 'user.update', 'user', id, { ...body, password: undefined });
    }

    const updated = await queryOne(
      'SELECT id, name, email, role, is_active AS "isActive", created_at AS "createdAt" FROM users WHERE id = ?',
      [id],
    );
    res.json({ data: updated });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === req.user?.id) throw badRequest('You cannot deactivate your own account.');

    const user = await queryOne<{ role: string; is_active: boolean }>('SELECT role, is_active FROM users WHERE id = ?', [id]);
    if (!user) throw notFound('User not found.');
    if (user.role === 'admin' && user.is_active && (await activeAdminCount()) <= 1) {
      throw badRequest('At least one active administrator is required.');
    }

    await execute('UPDATE users SET is_active = false WHERE id = ?', [id]);
    await logAudit(req.user?.id, 'user.deactivate', 'user', id);
    res.json({ ok: true });
  }),
);

export default router;
