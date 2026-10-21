import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/pool';
import { logAudit } from '../lib/audit';
import { conflict, notFound } from '../lib/errors';
import { asyncHandler, parseBody, parseId } from '../lib/helpers';
import { requireRole } from '../middleware/auth';

const router = Router();

const trainerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  email: z.string().trim().email('Enter a valid email.').max(190).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  specialization: z.string().trim().max(120).nullable().optional(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  notes: z.string().trim().max(255).nullable().optional(),
  userId: z.coerce.number().int().positive().nullable().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const rows = await query(
      `SELECT t.id, t.user_id AS userId, t.name, t.email, t.phone, t.specialization,
              t.hire_date AS hireDate, t.status, t.notes,
              (SELECT COUNT(*) FROM trainer_assignments a WHERE a.trainer_id = t.id AND a.ended_at IS NULL) AS assignedMembers,
              (SELECT COUNT(*) FROM trainer_assignments a WHERE a.trainer_id = t.id) AS totalAssignments
       FROM trainers t
       ${includeInactive ? '' : `WHERE t.status = 'active'`}
       ORDER BY t.status ASC, t.name ASC`,
    );
    res.json({ data: rows });
  }),
);

router.get(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const trainer = await queryOne<{ id: number }>('SELECT id FROM trainers WHERE id = ?', [id]);
    if (!trainer) throw notFound('Trainer not found.');

    const rows = await query(
      `SELECT a.id AS assignmentId, a.assigned_at AS assignedAt, a.notes,
              m.id, m.member_code AS memberCode, m.first_name AS firstName, m.last_name AS lastName,
              m.phone, m.photo_url AS photoUrl, m.status,
              s.end_date AS membershipEnds,
              CASE WHEN s.end_date IS NULL THEN 'none'
                   WHEN s.end_date < CURDATE() THEN 'expired'
                   ELSE 'active' END AS membershipStatus
       FROM trainer_assignments a
       JOIN members m ON m.id = a.member_id
       LEFT JOIN subscriptions s ON s.id = (
         SELECT s2.id FROM subscriptions s2 WHERE s2.member_id = m.id
         ORDER BY (s2.status = 'active') DESC, s2.end_date DESC LIMIT 1
       )
       WHERE a.trainer_id = ? AND a.ended_at IS NULL AND m.deleted_at IS NULL
       ORDER BY m.first_name, m.last_name`,
      [id],
    );
    res.json({ data: rows });
  }),
);

router.post(
  '/',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const body = parseBody(trainerSchema, req.body);
    const result = await execute(
      `INSERT INTO trainers (user_id, name, email, phone, specialization, hire_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.userId ?? null,
        body.name,
        body.email ?? null,
        body.phone ?? null,
        body.specialization ?? null,
        body.hireDate ?? null,
        body.status ?? 'active',
        body.notes ?? null,
      ],
    );
    await logAudit(req.user?.id, 'trainer.create', 'trainer', result.insertId, body);

    const trainer = await queryOne(
      `SELECT id, user_id AS userId, name, email, phone, specialization, hire_date AS hireDate, status, notes
       FROM trainers WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({ data: trainer });
  }),
);

router.patch(
  '/:id',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = parseBody(trainerSchema.partial(), req.body);

    const existing = await queryOne<{ id: number }>('SELECT id FROM trainers WHERE id = ?', [id]);
    if (!existing) throw notFound('Trainer not found.');

    const columns: Record<string, string> = {
      name: 'name',
      email: 'email',
      phone: 'phone',
      specialization: 'specialization',
      hireDate: 'hire_date',
      status: 'status',
      notes: 'notes',
      userId: 'user_id',
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) {
      if (key in body) {
        sets.push(`${column} = ?`);
        values.push((body as Record<string, unknown>)[key] ?? null);
      }
    }

    if (sets.length) {
      values.push(id);
      await execute(`UPDATE trainers SET ${sets.join(', ')} WHERE id = ?`, values);
      await logAudit(req.user?.id, 'trainer.update', 'trainer', id, body);
    }

    const trainer = await queryOne(
      `SELECT id, user_id AS userId, name, email, phone, specialization, hire_date AS hireDate, status, notes
       FROM trainers WHERE id = ?`,
      [id],
    );
    res.json({ data: trainer });
  }),
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const trainer = await queryOne<{ id: number }>('SELECT id FROM trainers WHERE id = ?', [id]);
    if (!trainer) throw notFound('Trainer not found.');

    await execute(`UPDATE trainers SET status = 'inactive' WHERE id = ?`, [id]);
    await execute('UPDATE trainer_assignments SET ended_at = CURDATE() WHERE trainer_id = ? AND ended_at IS NULL', [id]);
    await logAudit(req.user?.id, 'trainer.deactivate', 'trainer', id);
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/assign',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const trainerId = parseId(req.params.id);
    const body = parseBody(z.object({ memberId: z.coerce.number().int().positive() }), req.body);

    const trainer = await queryOne<{ id: number; status: string }>('SELECT id, status FROM trainers WHERE id = ?', [
      trainerId,
    ]);
    if (!trainer) throw notFound('Trainer not found.');
    if (trainer.status !== 'active') throw conflict('This trainer is not active.');

    const member = await queryOne('SELECT id FROM members WHERE id = ? AND deleted_at IS NULL', [body.memberId]);
    if (!member) throw notFound('Member not found.');

    const existing = await queryOne(
      'SELECT id FROM trainer_assignments WHERE trainer_id = ? AND member_id = ? AND ended_at IS NULL',
      [trainerId, body.memberId],
    );
    if (existing) throw conflict('This member is already assigned to that trainer.');

    const result = await execute(
      'INSERT INTO trainer_assignments (trainer_id, member_id, assigned_at) VALUES (?, ?, CURDATE())',
      [trainerId, body.memberId],
    );
    await logAudit(req.user?.id, 'trainer.assign', 'trainer_assignment', result.insertId, {
      trainerId,
      memberId: body.memberId,
    });
    res.status(201).json({ ok: true });
  }),
);

router.delete(
  '/:id/assign/:memberId',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const trainerId = parseId(req.params.id);
    const memberId = parseId(req.params.memberId);

    const result = await execute(
      'UPDATE trainer_assignments SET ended_at = CURDATE() WHERE trainer_id = ? AND member_id = ? AND ended_at IS NULL',
      [trainerId, memberId],
    );
    if (!result.affectedRows) throw notFound('Active assignment not found.');

    await logAudit(req.user?.id, 'trainer.unassign', 'trainer_assignment', null, { trainerId, memberId });
    res.json({ ok: true });
  }),
);

export default router;
