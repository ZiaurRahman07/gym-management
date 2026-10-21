import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, withTransaction, txExecute, txOne } from '../db/pool';
import { logAudit } from '../lib/audit';
import { conflict, notFound } from '../lib/errors';
import { asyncHandler, getPagination, like, paged, parseBody, parseId, todayStr } from '../lib/helpers';
import { requireRole } from '../middleware/auth';
import { createSubscriptionTx } from '../services/billing';

const router = Router();

const MEMBER_SELECT = `
  m.id, m.member_code AS "memberCode", m.first_name AS "firstName", m.last_name AS "lastName",
  m.email, m.phone, m.gender, m.dob, m.address, m.photo_url AS "photoUrl",
  m.emergency_contact AS "emergencyContact", m.join_date AS "joinDate", m.status, m.notes,
  m.created_at AS "createdAt",
  s.id AS "subscriptionId", s.start_date AS "subscriptionStart", s.end_date AS "subscriptionEnd",
  s.status AS "subscriptionStatus", s.final_amount AS "subscriptionAmount",
  p.id AS "planId", p.name AS "planName",
  CASE
    WHEN m.status = 'inactive' THEN 'inactive'
    WHEN m.status = 'blocked' THEN 'blocked'
    WHEN s.id IS NULL THEN 'none'
    WHEN s.status = 'frozen' THEN 'frozen'
    WHEN s.status = 'cancelled' THEN 'cancelled'
    WHEN s.end_date < CURRENT_DATE THEN 'expired'
    ELSE 'active'
  END AS "membershipStatus",
  (s.end_date - CURRENT_DATE) AS "daysLeft"
`;

const MEMBER_FROM = `
  FROM members m
  LEFT JOIN subscriptions s ON s.id = (
    SELECT s2.id FROM subscriptions s2
    WHERE s2.member_id = m.id
    ORDER BY (s2.status = 'active') DESC, s2.end_date DESC, s2.id DESC
    LIMIT 1
  )
  LEFT JOIN plans p ON p.id = s.plan_id
`;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.');

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const memberSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
  email: z.string().trim().email('Enter a valid email.').max(190).nullable().optional(),
  phone: z.string().trim().min(5, 'Enter a valid phone number.').max(30),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  dob: dateString.nullable().optional(),
  address: optionalText(255),
  photoUrl: optionalText(500),
  emergencyContact: optionalText(120),
  joinDate: dateString.optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
  notes: optionalText(2000),
  planId: z.coerce.number().int().positive().optional(),
  discount: z.coerce.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank', 'online']).optional(),
  comp: z.boolean().optional(),
});

const updateSchema = memberSchema.omit({ planId: true, discount: true, paymentMethod: true, comp: true }).partial();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req);
    const q = String(req.query.q ?? '').trim();
    const status = String(req.query.status ?? '').trim();
    const expiringIn = Number(req.query.expiringIn) || 0;
    const sort = String(req.query.sort ?? 'recent');

    const innerWhere = ['m.deleted_at IS NULL'];
    const innerParams: unknown[] = [];

    if (q) {
      innerWhere.push(
        '(m.member_code LIKE ? OR m.first_name LIKE ? OR m.last_name LIKE ? OR m.email LIKE ? OR m.phone LIKE ?)',
      );
      const term = like(q);
      innerParams.push(term, term, term, term, term);
    }
    if (status === 'inactive' || status === 'blocked') {
      innerWhere.push('m.status = ?');
      innerParams.push(status);
    }
    if (expiringIn > 0) {
      innerWhere.push(
        `s.status = ? AND s.end_date >= CURRENT_DATE AND s.end_date <= (CURRENT_DATE + (?::int * interval '1 day'))`,
      );
      innerParams.push('active', expiringIn);
    }

    const outerWhere: string[] = [];
    const outerParams: unknown[] = [];
    if (['active', 'expired', 'frozen', 'cancelled', 'none'].includes(status)) {
      outerWhere.push('"membershipStatus" = ?');
      outerParams.push(status);
    }

    const inner = `SELECT ${MEMBER_SELECT} ${MEMBER_FROM} WHERE ${innerWhere.join(' AND ')}`;
    const filter = outerWhere.length ? `WHERE ${outerWhere.join(' AND ')}` : '';

    const orderBy =
      sort === 'name'
        ? '"firstName" ASC, "lastName" ASC'
        : sort === 'expiry'
          ? '("subscriptionEnd" IS NULL) ASC, "subscriptionEnd" ASC'
          : sort === 'oldest'
            ? '"joinDate" ASC'
            : '"createdAt" DESC';

    const rows = await query(
      `SELECT * FROM (${inner}) t ${filter} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...innerParams, ...outerParams, limit, offset],
    );
    const countRow = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS "total" FROM (${inner}) t ${filter}`,
      [...innerParams, ...outerParams],
    );

    res.json(paged(rows, Number(countRow?.total ?? 0), page, limit));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const member = await queryOne(`SELECT ${MEMBER_SELECT} ${MEMBER_FROM} WHERE m.id = ? AND m.deleted_at IS NULL`, [
      id,
    ]);
    if (!member) throw notFound('Member not found.');

    const [subscriptions, payments, attendance, trainers, totals, visitInfo] = await Promise.all([
      query(
        `SELECT s.id, s.start_date AS "startDate", s.end_date AS "endDate", s.status, s.price_at_purchase AS "price",
                s.discount, s.final_amount AS "finalAmount", s.created_at AS "createdAt",
                p.name AS "planName", p.duration_days AS "durationDays"
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         WHERE s.member_id = ? ORDER BY s.start_date DESC, s.id DESC`,
        [id],
      ),
      query(
        `SELECT id, invoice_no AS "invoiceNo", amount, method, status, paid_at AS "paidAt", notes, subscription_id AS "subscriptionId"
         FROM payments WHERE member_id = ? ORDER BY paid_at DESC, id DESC`,
        [id],
      ),
      query(
        `SELECT id, check_in_at AS "checkInAt", check_out_at AS "checkOutAt", method
         FROM attendance WHERE member_id = ? ORDER BY check_in_at DESC LIMIT 25`,
        [id],
      ),
      query(
        `SELECT t.id, t.name, t.specialization, a.assigned_at AS "assignedAt"
         FROM trainer_assignments a JOIN trainers t ON t.id = a.trainer_id
         WHERE a.member_id = ? AND a.ended_at IS NULL ORDER BY t.name`,
        [id],
      ),
      queryOne<{ totalPaid: number; paymentCount: number }>(
        `SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS "totalPaid",
                COUNT(*) AS "paymentCount"
         FROM payments WHERE member_id = ?`,
        [id],
      ),
      queryOne<{ visits: number; lastVisit: string | null }>(
        'SELECT COUNT(*) AS "visits", MAX(check_in_at) AS "lastVisit" FROM attendance WHERE member_id = ?',
        [id],
      ),
    ]);

    res.json({
      data: {
        ...member,
        stats: {
          totalPaid: Number(totals?.totalPaid ?? 0),
          paymentCount: Number(totals?.paymentCount ?? 0),
          visits: Number(visitInfo?.visits ?? 0),
          lastVisit: visitInfo?.lastVisit ?? null,
        },
        subscriptions,
        payments,
        attendance,
        trainers,
      },
    });
  }),
);

router.post(
  '/',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const body = parseBody(memberSchema, req.body);

    const result = await withTransaction(async (conn) => {
      const placeholder = `TMP-${Date.now()}`;
      const inserted = await txExecute(
        conn,
        `INSERT INTO members
          (member_code, first_name, last_name, email, phone, gender, dob, address, photo_url,
           emergency_contact, join_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          placeholder,
          body.firstName,
          body.lastName,
          body.email ?? null,
          body.phone,
          body.gender ?? null,
          body.dob ?? null,
          body.address ?? null,
          body.photoUrl ?? null,
          body.emergencyContact ?? null,
          body.joinDate || todayStr(),
          body.status ?? 'active',
          body.notes ?? null,
        ],
      );

      const memberCode = `GYM-${String(inserted.insertId).padStart(4, '0')}`;
      await txExecute(conn, 'UPDATE members SET member_code = ? WHERE id = ?', [memberCode, inserted.insertId]);

      let enrollment = null;
      if (body.planId) {
        enrollment = await createSubscriptionTx(conn, {
          memberId: inserted.insertId,
          planId: body.planId,
          discount: body.discount,
          actorId: req.user?.id,
          comp: body.comp,
          payment:
            !body.comp && body.paymentMethod
              ? { method: body.paymentMethod, notes: 'Membership purchased at registration' }
              : null,
        });
      }

      return { id: inserted.insertId, memberCode, enrollment };
    });

    await logAudit(req.user?.id, 'member.create', 'member', result.id, { memberCode: result.memberCode });
    const created = await queryOne(`SELECT ${MEMBER_SELECT} ${MEMBER_FROM} WHERE m.id = ?`, [result.id]);
    res.status(201).json({ data: created, enrollment: result.enrollment });
  }),
);

router.patch(
  '/:id',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = parseBody(updateSchema, req.body);

    const columns: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      phone: 'phone',
      gender: 'gender',
      dob: 'dob',
      address: 'address',
      photoUrl: 'photo_url',
      emergencyContact: 'emergency_contact',
      joinDate: 'join_date',
      status: 'status',
      notes: 'notes',
    };

    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) {
      if (key in body) {
        sets.push(`${column} = ?`);
        values.push((body as Record<string, unknown>)[key] ?? null);
      }
    }
    if (!sets.length) {
      res.json({ data: await queryOne(`SELECT ${MEMBER_SELECT} ${MEMBER_FROM} WHERE m.id = ?`, [id]) });
      return;
    }

    const existing = await queryOne('SELECT id FROM members WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!existing) throw notFound('Member not found.');

    values.push(id);
    await execute(`UPDATE members SET ${sets.join(', ')} WHERE id = ?`, values);
    await logAudit(req.user?.id, 'member.update', 'member', id, body);

    const updated = await queryOne(`SELECT ${MEMBER_SELECT} ${MEMBER_FROM} WHERE m.id = ?`, [id]);
    res.json({ data: updated });
  }),
);

router.delete(
  '/:id',
  requireRole('admin', 'receptionist'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const member = await queryOne<{ id: number }>('SELECT id FROM members WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!member) throw notFound('Member not found.');

    await withTransaction(async (conn) => {
      await txExecute(conn, 'UPDATE members SET deleted_at = NOW(), status = ? WHERE id = ?', ['inactive', id]);
      await txExecute(
        conn,
        `UPDATE subscriptions SET status = 'cancelled' WHERE member_id = ? AND status IN ('active','frozen')`,
        [id],
      );
      await txExecute(conn, 'UPDATE trainer_assignments SET ended_at = CURRENT_DATE WHERE member_id = ? AND ended_at IS NULL', [
        id,
      ]);
      await txExecute(conn, 'DELETE FROM notifications WHERE member_id = ?', [id]);
    });

    await logAudit(req.user?.id, 'member.archive', 'member', id);
    res.json({ ok: true });
  }),
);

router.get(
  '/:id/qr',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const member = await queryOne<{ memberCode: string; firstName: string; lastName: string }>(
      'SELECT member_code AS "memberCode", first_name AS "firstName", last_name AS "lastName" FROM members WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (!member) throw notFound('Member not found.');
    res.json({ data: { code: member.memberCode, name: `${member.firstName} ${member.lastName}` } });
  }),
);

export default router;
