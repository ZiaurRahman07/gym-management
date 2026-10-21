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
  const seedPath = findSqlFile('seed.sql');
  const seed = fs.readFileSync(seedPath, 'utf8');

  console.log(`Seeding from ${path.relative(process.cwd(), seedPath)}...`);
  await query(seed);
  console.log('Seed completed.');
}

run()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
