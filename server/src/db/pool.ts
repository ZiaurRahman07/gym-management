import mysql from 'mysql2/promise';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 12,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,
  decimalNumbers: true,
  supportBigNumbers: true,
});

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params as never);
  return result;
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export type Conn = PoolConnection;

export async function txQuery<T = Record<string, unknown>>(
  conn: Conn,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await conn.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

export async function txOne<T = Record<string, unknown>>(
  conn: Conn,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await txQuery<T>(conn, sql, params);
  return rows[0] ?? null;
}

export async function txExecute(conn: Conn, sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await conn.execute<ResultSetHeader>(sql, params as never);
  return result;
}
