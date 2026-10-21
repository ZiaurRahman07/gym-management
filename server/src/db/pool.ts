import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env';

// Keep response shapes stable for the React client.
types.setTypeParser(1700, (value) => Number(value)); // numeric
types.setTypeParser(20, (value) => Number(value)); // int8 / COUNT(*)
types.setTypeParser(1082, (value) => value); // date -> YYYY-MM-DD
types.setTypeParser(1114, (value) => value); // timestamp -> YYYY-MM-DD HH:mm:ss
types.setTypeParser(1184, (value) => new Date(value).toISOString()); // timestamptz

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (error) => {
  console.error('[db] idle client error', error);
});

/**
 * Persist the gym timezone on the database so every new connection, including
 * pgbouncer/Supabase pooler sessions, uses it for CURRENT_DATE and ::date.
 * Failure is non-fatal: set it manually in Supabase if the role lacks ALTER.
 */
export async function ensureDatabaseTimezone(): Promise<void> {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const result = await client.query<{ db: string }>('SELECT current_database() AS db');
    const dbName = result.rows[0]?.db;
    if (!dbName) return;
    const quotedDb = dbName.replace(/"/g, '""');
    const timezone = env.GYM_TIMEZONE.replace(/'/g, "''");
    await client.query(`ALTER DATABASE "${quotedDb}" SET timezone = '${timezone}'`);
    // The connection that ran ALTER keeps its old session timezone; fix it too.
    await client.query(`SET TIME ZONE '${timezone}'`);
  } catch (error) {
    console.warn(
      `[db] could not set database timezone to ${env.GYM_TIMEZONE}; set it manually with: ALTER DATABASE postgres SET timezone = '${env.GYM_TIMEZONE}';`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    client?.release();
  }
}

/**
 * The routes were written with `?` placeholders. Convert them to Postgres
 * `$1`, `$2`, ... while leaving question marks inside string literals alone.
 */
export function toPg(sql: string): string {
  let index = 0;
  let output = '';
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (quote) {
      output += char;
      if (char === quote) {
        if (next === quote) {
          output += next;
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      output += char;
      continue;
    }

    if (char === '?') {
      index += 1;
      output += `$${index}`;
      continue;
    }

    output += char;
  }

  return output;
}

/** Adds `RETURNING id` to plain inserts so `insertId` keeps working. */
function withReturning(sql: string): string {
  const trimmed = sql.trim();
  if (
    /^insert\s/i.test(trimmed) &&
    !/\breturning\b/i.test(trimmed) &&
    !/\bon\s+conflict\b/i.test(trimmed)
  ) {
    return `${trimmed} RETURNING id`;
  }
  return trimmed;
}

export async function query<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result: QueryResult<T> = await pool.query<T>(toPg(sql), params as never[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export type ExecuteResult = { insertId: number; affectedRows: number };

export async function execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
  const result = await pool.query(toPg(withReturning(sql)), params as never[]);
  const first = result.rows[0] as { id?: number } | undefined;
  return {
    insertId: first?.id ?? 0,
    affectedRows: result.rowCount ?? 0,
  };
}

export async function withTransaction<T>(fn: (conn: PoolClient) => Promise<T>): Promise<T> {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const result = await fn(conn);
    await conn.query('COMMIT');
    return result;
  } catch (error) {
    await conn.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    conn.release();
  }
}

export type Conn = PoolClient;

export async function txQuery<T extends QueryResultRow = Record<string, unknown>>(
  conn: Conn,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await conn.query<T>(toPg(sql), params as never[]);
  return result.rows;
}

export async function txOne<T extends QueryResultRow = Record<string, unknown>>(
  conn: Conn,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await txQuery<T>(conn, sql, params);
  return rows[0] ?? null;
}

export async function txExecute(conn: Conn, sql: string, params: unknown[] = []): Promise<ExecuteResult> {
  const result = await conn.query(toPg(withReturning(sql)), params as never[]);
  const first = result.rows[0] as { id?: number } | undefined;
  return {
    insertId: first?.id ?? 0,
    affectedRows: result.rowCount ?? 0,
  };
}
