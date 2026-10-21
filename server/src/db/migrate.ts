import { execute, pool, query } from './pool';
import { migrations } from './migrations';

async function run() {
  await execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(64) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );

  const applied = await query<{ id: string }>('SELECT id FROM schema_migrations');
  const appliedIds = new Set(applied.map((row) => row.id));

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue;
    console.log(`→ applying ${migration.id}`);
    for (const statement of migration.statements) {
      await execute(statement);
    }
    await execute('INSERT INTO schema_migrations (id) VALUES (?)', [migration.id]);
    console.log(`✓ ${migration.id}`);
  }

  console.log('Database schema is up to date.');
}

run()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
