import { Router } from 'express';
import { execute, query, queryOne } from '../db/pool';
import { notFound } from '../lib/errors';
import { asyncHandler, parseId } from '../lib/helpers';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const onlyUnread = req.query.unread === 'true';

    const rows = await query(
      `SELECT n.id, n.member_id AS "memberId", n.subscription_id AS "subscriptionId", n.type,
              n.title, n.body, n.read_at AS "readAt", n.created_at AS "createdAt",
              m.member_code AS "memberCode", m.first_name AS "firstName", m.last_name AS "lastName",
              m.photo_url AS "photoUrl"
       FROM notifications n
       LEFT JOIN members m ON m.id = n.member_id
       ${onlyUnread ? 'WHERE n.read_at IS NULL' : ''}
       ORDER BY (n.read_at IS NULL) DESC, n.created_at DESC, n.id DESC
       LIMIT ?`,
      [limit],
    );

    const unread = await queryOne<{ count: number }>('SELECT COUNT(*) AS "count" FROM notifications WHERE read_at IS NULL');

    res.json({ data: rows, unread: Number(unread?.count ?? 0) });
  }),
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const result = await execute('UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ?', [id]);
    if (!result.affectedRows) throw notFound('Notification not found.');
    res.json({ ok: true });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (_req, res) => {
    await execute('UPDATE notifications SET read_at = NOW() WHERE read_at IS NULL');
    res.json({ ok: true });
  }),
);

export default router;
