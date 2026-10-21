import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env, isProd } from './config/env';
import { queryOne } from './db/pool';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authenticate } from './middleware/auth';
import { readSettings } from './routes/settings';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import membersRoutes from './routes/members';
import plansRoutes from './routes/plans';
import subscriptionsRoutes from './routes/subscriptions';
import paymentsRoutes from './routes/payments';
import attendanceRoutes from './routes/attendance';
import trainersRoutes from './routes/trainers';
import dashboardRoutes from './routes/dashboard';
import notificationsRoutes from './routes/notifications';
import reportsRoutes from './routes/reports';
import settingsRoutes from './routes/settings';

export const app = express();

if (isProd) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.get('/api/health', async (_req, res, next) => {
  try {
    const row = await queryOne<{ ok: number }>('SELECT 1 AS ok');
    res.json({ status: 'ok', database: row?.ok === 1 ? 'connected' : 'unknown', time: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/public/config', async (_req, res, next) => {
  try {
    const settings = await readSettings();
    res.json({
      data: {
        gymName: settings.gym_name,
        currencyCode: settings.currency_code,
        currencySymbol: settings.currency_symbol,
        timezone: settings.timezone,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', authRoutes);

// Unknown API routes should 404 even when unauthenticated.
app.use('/api', (req, _res, next) => {
  const known = ['/users', '/members', '/plans', '/subscriptions', '/payments', '/attendance', '/trainers',
    '/dashboard', '/notifications', '/reports', '/settings'];
  if (!known.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    next();
    return;
  }
  authenticate(req, _res, next);
});

app.use('/api/users', usersRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/trainers', trainersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);

const clientDist = path.resolve(__dirname, '../../client/dist');
if (isProd && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);
