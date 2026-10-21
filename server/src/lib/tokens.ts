import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthUser } from '../types';

const ACCESS_TTL = 60 * 30; // 30 minutes
const REFRESH_TTL = 60 * 60 * 24 * 7; // 7 days

export const REFRESH_COOKIE = 'gym_refresh';

type AccessPayload = { sub: number; role: string; type: 'access' };
type RefreshPayload = { sub: number; type: 'refresh' };

export function signAccessToken(user: AuthUser): string {
  const payload: AccessPayload = { sub: user.id, role: user.role, type: 'access' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(userId: number): string {
  const payload: RefreshPayload = { sub: userId, type: 'refresh' };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyAccessToken(token: string): AccessPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessPayload;
  if (payload.type !== 'access') throw new Error('Wrong token type');
  return payload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as RefreshPayload;
  if (payload.type !== 'refresh') throw new Error('Wrong token type');
  return payload;
}

export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
  maxAge: REFRESH_TTL * 1000,
};
