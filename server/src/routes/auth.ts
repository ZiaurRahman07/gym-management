import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { execute, queryOne } from '../db/pool';
import { logAudit } from '../lib/audit';
import { badRequest, HttpError } from '../lib/errors';
import { asyncHandler, parseBody } from '../lib/helpers';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/tokens';
import { authenticate } from '../middleware/auth';
import type { Role } from '../types';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please wait a few minutes.' } },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

type UserRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
};

// Used when the email does not exist so a failed login takes similar time.
const DUMMY_HASH = '$2b$10$miOcYTU97NCNBuT0jr.TX.B8MS.UQsit1zBa.KDhqcasrFUXeSVii';

function publicUser(user: Omit<UserRow, 'password_hash' | 'is_active'>) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const user = await queryOne<UserRow>('SELECT * FROM users WHERE email = ?', [body.email]);

    const passwordMatches = await bcrypt.compare(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !passwordMatches) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    if (!user.is_active) {
      throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Contact an administrator.');
    }

    const accessToken = signAccessToken({ id: user.id, name: user.name, email: user.email, role: user.role });
    res.cookie(REFRESH_COOKIE, signRefreshToken(user.id), refreshCookieOptions);
    await logAudit(user.id, 'auth.login', 'user', user.id);

    res.json({ token: accessToken, user: publicUser(user) });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new HttpError(401, 'NO_SESSION', 'Your session has ended. Please sign in again.');

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new HttpError(401, 'NO_SESSION', 'Your session has ended. Please sign in again.');
    }

    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!user || !user.is_active) {
      throw new HttpError(401, 'NO_SESSION', 'This account is not available.');
    }

    const accessToken = signAccessToken({ id: user.id, name: user.name, email: user.email, role: user.role });
    res.cookie(REFRESH_COOKIE, signRefreshToken(user.id), refreshCookieOptions);
    res.json({ token: accessToken, user: publicUser(user) });
  }),
);

router.post('/logout', (req, res) => {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, 'Use at least 8 characters.'),
      }),
      req.body,
    );
    const user = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [
      req.user!.id,
    ]);
    if (!user || !(await bcrypt.compare(body.currentPassword, user.password_hash))) {
      throw badRequest('Your current password is incorrect.');
    }
    const hash = await bcrypt.hash(body.newPassword, 12);
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user!.id]);
    res.json({ ok: true });
  }),
);

export default router;
