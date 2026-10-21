import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Preferred on Render/Supabase: one Postgres connection string.
  DATABASE_URL: z.string().min(1).optional(),

  // Fallback for split connection settings.
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('postgres'),
  DB_SSL: booleanFromEnv(false),
  DB_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),

  JWT_ACCESS_SECRET: z.string().min(24, 'JWT_ACCESS_SECRET must be at least 24 characters'),
  JWT_REFRESH_SECRET: z.string().min(24, 'JWT_REFRESH_SECRET must be at least 24 characters'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  GYM_TIMEZONE: z
    .string()
    .default('UTC')
    .refine((timezone) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        return true;
      } catch {
        return false;
      }
    }, 'GYM_TIMEZONE must be an IANA name such as UTC or Asia/Dhaka'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

// Supabase and Render inject DATABASE_URL. When it is present, SSL is on
// unless DB_SSL=false is set explicitly. Local Postgres usually has no SSL.
const isLocalHost = /^(localhost|127\.0\.0\.1|::1)$/.test(raw.DB_HOST);
const databaseUrl =
  raw.DATABASE_URL ??
  `postgresql://${encodeURIComponent(raw.DB_USER)}:${encodeURIComponent(raw.DB_PASSWORD)}@${raw.DB_HOST}:${raw.DB_PORT}/${raw.DB_NAME}`;

export const env = {
  ...raw,
  databaseUrl,
  // A connection string that points at Supabase always needs TLS.
  dbSsl: raw.DATABASE_URL ? raw.DB_SSL || !/localhost|127\.0\.0\.1/.test(raw.DATABASE_URL) : raw.DB_SSL || !isLocalHost,
};

export const isProd = env.NODE_ENV === 'production';
