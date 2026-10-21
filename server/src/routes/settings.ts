import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { logAudit } from '../lib/audit';
import { asyncHandler, parseBody } from '../lib/helpers';
import { requireRole } from '../middleware/auth';

const router = Router();

const DEFAULTS: Record<string, string> = {
  gym_name: 'Iron Pulse Fitness',
  currency_code: 'USD',
  currency_symbol: '$',
  timezone: 'UTC',
  alert_lead_days: '7',
  allow_expired_checkin: 'false',
};

const FIELD_MAP: Record<string, string> = {
  gymName: 'gym_name',
  currencyCode: 'currency_code',
  currencySymbol: 'currency_symbol',
  timezone: 'timezone',
  alertLeadDays: 'alert_lead_days',
  allowExpiredCheckin: 'allow_expired_checkin',
};

export async function readSettings(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string | null }>('SELECT "key", "value" FROM settings');
  const map = { ...DEFAULTS };
  for (const row of rows) if (row.value !== null) map[row.key] = row.value;
  return map;
}

function shape(map: Record<string, string>) {
  return {
    gymName: map.gym_name,
    currencyCode: map.currency_code,
    currencySymbol: map.currency_symbol,
    timezone: map.timezone,
    alertLeadDays: Number(map.alert_lead_days) || 7,
    allowExpiredCheckin: map.allow_expired_checkin === 'true',
  };
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: shape(await readSettings()) });
  }),
);

router.put(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        gymName: z.string().trim().min(1).max(120).optional(),
        currencyCode: z.string().trim().min(1).max(8).optional(),
        currencySymbol: z.string().trim().min(1).max(8).optional(),
        timezone: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .refine((timezone) => {
            try {
              new Intl.DateTimeFormat('en-US', { timeZone: timezone });
              return true;
            } catch {
              return false;
            }
          }, 'Use an IANA timezone such as UTC or Asia/Dhaka.')
          .optional(),
        alertLeadDays: z.coerce.number().int().min(1).max(60).optional(),
        allowExpiredCheckin: z.boolean().optional(),
      }),
      req.body,
    );

    const entries = Object.entries(body).filter(([, value]) => value !== undefined);
    for (const [key, value] of entries) {
      const column = FIELD_MAP[key];
      if (!column) continue;
      const stored = typeof value === 'boolean' ? String(value) : String(value);
      await queryOne('INSERT INTO settings ("key", "value") VALUES (?, ?) ON CONFLICT ("key") DO UPDATE SET "value" = excluded."value"', [
        column,
        stored,
      ]);
    }

    await logAudit(req.user?.id, 'settings.update', 'settings', null, body);
    res.json({ data: shape(await readSettings()) });
  }),
);

export default router;
