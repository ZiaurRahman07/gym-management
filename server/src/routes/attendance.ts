import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/pool';
import { logAudit } from '../lib/audit';
import { badRequest, conflict, notFound } from '../lib/errors';
import { asyncHandler, getPagination, like, paged, parseBody, parseId, todayStr } from '../lib/helpers';
import { requireRole } from '../middleware/auth';

const router = Router();

async function allowExpiredCheckin(): Promise<boolean> {
  const setting = await queryOne<{ value: string }>('SELECT "value" FROM settings WHERE "key" = ?', [
    'allow_expired_checkin',
  ]);
  return setting?.value === 'true';
}

const ATT_SELECT = `
  a.id, a.member_id AS "memberId", a.check_in_at AS "checkInAt", a.check_out_at AS "checkOutAt", a.method,
  m.member_code AS "memberCode", m.first_name AS "firstName", m.last_name AS "lastName", m.photo_url AS "photoUrl",
  p.name AS "planName"
`;

const ATT_FROM = `
  FROM attendance a
  JOIN members m ON m.id = a.member_id
  LEFT JOIN subscriptions s ON s.id = (
    SELECT s2.id FROM subscriptions s2 WHERE s2.member_id = a.member_id
    ORDER BY s2.end_date DESC, s2.id DESC LIMIT 1
  )
  LEFT JOIN plans p ON p.id = s.plan_id
`;

router.get(
  '/today',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT ${ATT_SELECT} ${ATT_FROM}
       WHERE a.check_in_at >= CURRENT_DATE AND a.check_in_at < (CURRENT_DATE + interval '1 day')
       ORDER BY a.check_in_at DESC`,
    );
    const inside = rows.filter((row) => !(row as { checkOutAt: string | null }).checkOutAt);

    res.json({
      data: {
        inside,
        recent: rows.slice(0, 60),
        todayCount: rows.length,
        insideCount: inside.length,
      },
    });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req, 30);
    const date = String(req.query.date ?? '').trim();
    const memberId = Number(req.query.memberId) || 0;
    const q = String(req.query.q ?? '').trim();

    const where: string[] = [];
    const params: unknown[] = [];

    if (date) {
      where.push(`a.check_in_at >= ?::date AND a.check_in_at < (?::date + interval '1 day')`);
      params.push(date, date);
    }
    if (memberId) {
      where.push('a.member_id = ?');
      params.push(memberId);
    }
    if (q) {
      where.push('(m.member_code LIKE ? OR m.first_name LIKE ? OR m.last_name LIKE ?)');
      const term = like(q);
      params.push(term, term, term);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await query(
      `SELECT ${ATT_SELECT} ${ATT_FROM} ${clause} ORDER BY a.check_in_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const countRow = await queryOne<{ total: number }>(`SELECT COUNT(*) AS "total" ${ATT_FROM} ${clause}`, params);

    res.json(paged(rows, Number(countRow?.total ?? 0), page, limit));
  }),
);

router.post(
  '/check-in',
  requireRole('admin', 'receptionist', 'trainer'),
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ memberId: z.coerce.number().int().positive() }), req.body);

    const member = await queryOne<{
      id: number;
      status: string;
      firstName: string;
      lastName: string;
      subscriptionId: number | null;
      subscriptionStatus: string | null;
      endDate: string | null;
      memberCode: string;
    }>(
      `SELECT m.id, m.status, m.first_name AS "firstName", m.last_name AS "lastName", m.member_code AS "memberCode",
              s.id AS "subscriptionId", s.status AS "subscriptionStatus", s.end_date AS "endDate"
       FROM members m
       LEFT JOIN subscriptions s ON s.id = (
         SELECT s2.id FROM subscriptions s2 WHERE s2.member_id = m.id AND s2.status = 'active'
         ORDER BY s2.end_date DESC LIMIT 1
       )
       WHERE m.id = ? AND m.deleted_at IS NULL`,
      [body.memberId],
    );

    if (!member) throw notFound('Member not found.');
    if (member.status !== 'active') throw badRequest('This member is not active.');

    const todayIso = todayStr();

    if (!member.subscriptionId) {
      throw badRequest(`${member.firstName} ${member.lastName} has no active membership.`);
    }
    if (member.endDate && member.endDate < todayIso && !(await allowExpiredCheckin())) {
      throw badRequest(
        `${member.firstName} ${member.lastName}'s membership expired on ${member.endDate}. Renew it before checking in.`,
      );
    }

    const open = await queryOne<{ id: number; checkInAt: string }>(
      'SELECT id, check_in_at AS "checkInAt" FROM attendance WHERE member_id = ? AND check_out_at IS NULL ORDER BY id DESC LIMIT 1',
      [body.memberId],
    );
    if (open) throw conflict(`Already checked in since ${open.checkInAt}.`);

    const result = await execute('INSERT INTO attendance (member_id, check_in_at, method, recorded_by) VALUES (?, NOW(), ?, ?)', [
      body.memberId,
      'manual',
      req.user?.id ?? null,
    ]);
    await logAudit(req.user?.id, 'attendance.check_in', 'attendance', result.insertId, { memberId: body.memberId });

    const record = await queryOne(`SELECT ${ATT_SELECT} ${ATT_FROM} WHERE a.id = ?`, [result.insertId]);
    res.status(201).json({ data: record });
  }),
);

router.patch(
  '/:id/check-out',
  requireRole('admin', 'receptionist', 'trainer'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const open = await queryOne<{ id: number }>('SELECT id FROM attendance WHERE id = ? AND check_out_at IS NULL', [id]);
    if (!open) throw badRequest('That visit is already closed.');

    await execute('UPDATE attendance SET check_out_at = NOW() WHERE id = ?', [id]);
    await logAudit(req.user?.id, 'attendance.check_out', 'attendance', id);

    const record = await queryOne(`SELECT ${ATT_SELECT} ${ATT_FROM} WHERE a.id = ?`, [id]);
    res.json({ data: record });
  }),
);

export default router;
