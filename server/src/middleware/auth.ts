import type { RequestHandler } from 'express';
import { queryOne } from '../db/pool';
import { HttpError } from '../lib/errors';
import { asyncHandler } from '../lib/helpers';
import { verifyAccessToken } from '../lib/tokens';
import type { AuthUser, Role } from '../types';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.');
  }

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw new HttpError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please sign in again.');
  }

  const user = await queryOne<{ id: number; name: string; email: string; role: Role; is_active: boolean }>(
    'SELECT id, name, email, role, is_active FROM users WHERE id = ?',
    [payload.sub],
  );

  if (!user || !user.is_active) {
    throw new HttpError(401, 'UNAUTHORIZED', 'This account is not available.');
  }

  const authUser: AuthUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  req.user = authUser;
  next();
});

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}
