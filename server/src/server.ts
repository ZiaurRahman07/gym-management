import type { Server } from 'node:http';
import cron from 'node-cron';
import { app } from './app';
import { env } from './config/env';
import { pool, query, ensureDatabaseTimezone } from './db/pool';
import { runExpiryJob } from './jobs/expiry';

/**
 * Binds the HTTP listener, retrying briefly when the previous process is still
 * releasing the port (common with `tsx watch` restarts on Windows).
 */
function listen(attempt = 1): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(env.PORT, () => resolve(server));
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && attempt < 8) {
        setTimeout(() => {
          listen(attempt + 1).then(resolve, reject);
        }, 400 * attempt);
        return;
      }
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${env.PORT} is already in use. Stop the other process or set PORT to a different value in server/.env.`,
          ),
        );
        return;
      }
      reject(error);
    });
  });
}

async function start() {
  await query('SELECT 1');
  await ensureDatabaseTimezone();
  console.log(
    `Connected to PostgreSQL (${env.DATABASE_URL ? 'DATABASE_URL' : `${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`}), timezone ${env.GYM_TIMEZONE}`,
  );

  runExpiryJob()
    .then((result) =>
      console.log(`Expiry sweep: ${result.expired} lapsed, ${result.alertsCreated} new alerts (${result.leadDays}-day window)`),
    )
    .catch((error) => console.error('Expiry sweep failed', error));

  cron.schedule(
    '5 0 * * *',
    () => {
      runExpiryJob()
        .then((result) =>
          console.log(
            `Expiry sweep: ${result.expired} lapsed, ${result.alertsCreated} new alerts (${result.leadDays}-day window)`,
          ),
        )
        .catch((error) => console.error('Expiry sweep failed', error));
    },
    { timezone: env.GYM_TIMEZONE },
  );

  const server = await listen();
  console.log(`API ready on http://localhost:${env.PORT}`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down...`);
    server.closeAllConnections();
    server.close();
    try {
      await pool.end();
    } catch {
      /* pool already closed */
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    void shutdown('uncaughtException');
  });
}

start().catch((error) => {
  console.error(`Failed to start API: ${(error as Error).message}`);
  process.exit(1);
});
