import fs from 'node:fs';
import path from 'node:path';
import { pool, query } from './pool';

function findSqlFile(name: string): string {
  const candidates = [
    path.resolve(process.cwd(), '../supabase', name),
    path.resolve(process.cwd(), 'supabase', name),
    path.resolve(__dirname, '../../../supabase', name),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Could not find supabase/${name}. Run this from the repository root or the server folder.`);
  }
  return found;
}

async function run() {
  const schemaPath = findSqlFile('schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  console.log(`Applying ${path.relative(process.cwd(), schemaPath)}...`);
  await query(schema);
  console.log('Database schema is up to date.');
  await query(
    `create table if not exists public.schema_migrations (
       id text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  await query(
    `insert into public.schema_migrations (id) values ('0001_supabase_schema')
     on conflict (id) do nothing`,
  );
}

run()
  .catch((error) => {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
