-- ============================================================================
-- Create or reset an application staff account
--
-- Run this in Supabase Studio -> SQL Editor AFTER supabase/schema.sql.
--
-- IMPORTANT: this app signs in against public.users, not Supabase
-- Authentication (auth.users). Creating a user under Authentication -> Users
-- does NOT create an account this app can use.
--
-- Replace the three values below, then run the whole file.
-- ============================================================================

insert into public.users (name, email, password_hash, role, is_active)
values (
  'Your Name',
  'you@example.com',
  crypt('YourStrongPassword123!', gen_salt('bf', 12)),
  'admin',
  true
)
on conflict (email) do update
  set name = excluded.name,
      password_hash = excluded.password_hash,
      role = excluded.role,
      is_active = true;

-- Verify: shows the account without exposing the hash.
select id, name, email, role, is_active
  from public.users
 where email = 'you@example.com';
