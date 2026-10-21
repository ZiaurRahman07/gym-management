import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, query } from './pool';

/**
 * Create or reset an application staff account.
 *
 * Usage:
 *   npm run db:user -- "Alex Morgan" admin@example.com "StrongPass123" admin
 *
 * Roles: admin | receptionist | trainer. The role defaults to receptionist.
 * This writes to public.users (the account table this app logs in against),
 * not to Supabase Authentication (auth.users).
 */
const args = process.argv.slice(2);
const [name, email, password, roleArg = 'receptionist'] = args;

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.enum(['admin', 'receptionist', 'trainer']),
});

async function run() {
  const parsed = schema.safeParse({ name, email, password, role: roleArg });
  if (!parsed.success) {
    console.error('Usage: npm run db:user -- "Full Name" email@example.com "password" admin|receptionist|trainer');
    for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }

  const { name: fullName, email: address, password: plain, role } = parsed.data;
  const hash = await bcrypt.hash(plain, 12);

  const user = await query<{ id: number; email: string; role: string }>(
    `insert into public.users (name, email, password_hash, role, is_active)
     values (?, ?, ?, ?, true)
     on conflict (email) do update
       set name = excluded.name,
           password_hash = excluded.password_hash,
           role = excluded.role,
           is_active = true
     returning id, email, role`,
    [fullName, address, hash, role],
  );

  console.log(`Account ready: ${user[0].email} (${user[0].role}, id ${user[0].id})`);
  console.log('Sign in with the email and password you just supplied.');
}

run()
  .catch((error) => {
    console.error('Could not create the account:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
