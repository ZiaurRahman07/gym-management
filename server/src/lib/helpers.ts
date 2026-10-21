import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { env } from '../config/env';
import { HttpError } from './errors';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler = (fn: AsyncRoute): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new HttpError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', details);
  }
  return result.data;
}

export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'INVALID_ID', 'Invalid identifier.');
  }
  return id;
}

export function getPagination(req: Request, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export function paged<T>(data: T[], total: number, page: number, limit: number) {
  return { data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export function like(value: string): string {
  return `%${value.trim().replace(/\\/g, '\\\\').replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const gymDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: env.GYM_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const gymDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: env.GYM_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function formattedParts(date: Date, formatter: Intl.DateTimeFormat): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return parts;
}

/** Calendar date in the gym timezone. */
export function gymDateStr(date = new Date()): string {
  const parts = formattedParts(date, gymDateFormatter);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Local (gym timezone) timestamp without an offset, for Postgres timestamptz. */
export function gymDateTimeStr(date = new Date()): string {
  const parts = formattedParts(date, gymDateTimeFormatter);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateStr(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(dateStr: string, days: number): string {
  const date = parseDateStr(dateStr);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

export function todayStr(): string {
  return gymDateStr();
}

export function monthStart(value = new Date()): string {
  return `${gymDateStr(value).slice(0, 7)}-01`;
}

/** Accepts 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DD HH:mm:ss' or nothing (now, in the gym timezone). */
export function toSqlDateTime(value?: string | null): string {
  if (!value) return gymDateTimeStr();
  const normalized = value.replace('T', ' ').trim();
  if (normalized.length === 16) return `${normalized}:00`;
  return normalized.slice(0, 19);
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(','));
  return `\uFEFF${[header, ...lines].join('\r\n')}`;
}
