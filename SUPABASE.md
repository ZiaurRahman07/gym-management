# Running on Supabase (PostgreSQL)

This app now runs on **PostgreSQL** end to end. The API uses `pg` (no MySQL driver), the
schema in `supabase/` is the single source of truth, and the Express server serves the React
build in production.

```
supabase/
├── schema.sql       tables, indexes, constraints, triggers, views, RLS, expiry functions
├── seed.sql         optional demo data (10 members, 3 staff accounts, plans, payments)
├── create-user.sql  create or reset one staff login (run this to fix sign-in)
├── cleanup-copy.sql one-time removal of em/en dashes from existing free-text rows
└── cron.sql         optional pg_cron schedule for the nightly expiry sweep
```

## 1. First-time database setup

1. Create a project at [supabase.com](https://supabase.com) and wait for provisioning.
2. Open **SQL Editor -> New query**.
3. Paste all of `supabase/schema.sql` and run it. You should get "Success. No rows returned".
4. Optional: run `supabase/seed.sql` for a demo roster. The script refuses to run twice.
5. Create your own login with `supabase/create-user.sql` (edit the name, email and password first),
   or let the first administrator add staff under **Settings -> Team access** later.

### Important: Supabase Auth is not this app's login

The app has its own staff table, `public.users`, with bcrypt password hashes. A user created under
**Authentication -> Users** lives in `auth.users` and **cannot sign in to this app**. That is the
most common cause of "I created a user and login fails".

Use one of these instead:

- `supabase/create-user.sql` in the SQL editor, or
- the server helper (needs `DATABASE_URL`):

  ```bash
  npm run db:user -- "Alex Morgan" admin@example.com "StrongPass123!" admin
  ```

Roles are `admin`, `receptionist`, `trainer`. Emails are stored lowercase; the login form lowercases
what you type.

### Updating an existing project

If your database already had data from an earlier version, run `supabase/cleanup-copy.sql` once.
It replaces em/en dashes in plan descriptions, payment notes, member notes and notification bodies
with a plain hyphen. It is safe to re-run.

### Demo accounts (only if you ran seed.sql)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@gym.local` | `Admin@12345` |
| Receptionist | `frontdesk@gym.local` | `Frontdesk@123` |
| Trainer | `trainer@gym.local` | `Trainer@123` |

Change or delete these before real use.

## 2. What the schema includes

- 11 tables with foreign keys, check constraints and indexes.
- `subscriptions_no_overlap`: a GiST exclusion constraint that blocks overlapping active/frozen
  memberships per member while allowing an upcoming renewal.
- `attendance_one_open_visit`: a partial unique index so a member cannot have two open visits.
- `touch_updated_at` triggers on every table with `updated_at`.
- `member_overview` view with `membership_status` and `days_left`.
- `expire_memberships()`, `generate_expiry_alerts()`, `run_expiry_job()` for the expiry sweep.
- RLS enabled on all 11 tables with no policies. The API connects as the Postgres role
  (or `service_role`), which bypasses RLS. The anon key cannot read anything, by design.

Verified behaviour:

| Test | Result |
|---|---|
| Fresh schema + seed on PostgreSQL 17 | passes |
| Schema run twice | passes (idempotent) |
| Seed run twice | refused with a clear error |
| Overlapping active membership insert | rejected by `subscriptions_no_overlap` |
| Second open visit insert | rejected by `attendance_one_open_visit` |
| Expiry job run twice | second run creates 0 duplicate alerts |
| Demo bcrypt hashes | all three verify |

## 3. Environment variables

### Render (API + web)

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase **Session pooler** string, port `5432` |
| `DB_SSL` | `true` |
| `JWT_ACCESS_SECRET` | 64+ random characters |
| `JWT_REFRESH_SECRET` | a different 64+ random string |
| `CLIENT_ORIGIN` | `https://your-render-service.onrender.com` (comma-separate extras) |
| `GYM_TIMEZONE` | e.g. `Asia/Dhaka` or `UTC` |
| `COOKIE_SAMESITE` | `lax` when the UI and API share a site |

Do **not** set `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` when `DATABASE_URL` is set.

Connection string shape:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Use **Settings -> Database -> Connection string -> Session pooler**. The direct host
(`db.<ref>.supabase.co:5432`) also works on Render. The transaction pooler (port `6543`) can work
but has less predictable prepared-statement and timezone behaviour; the session pooler is safer for
this long-running Node process.

**The Supabase anon key and project URL are not used by this API.** They are only needed if you
query Supabase from the browser directly, which this app does not do. If you added
`SUPABASE_URL` / `SUPABASE_ANON_KEY` to Render, they are harmless but do nothing.

At startup the API runs `ALTER DATABASE ... SET timezone = '<GYM_TIMEZONE>'` so date boundaries and
report grouping use your gym's local day. If the database role cannot run that statement, the log
shows a warning and you can set the timezone once in the Supabase SQL editor:

```sql
alter database postgres set timezone = 'Asia/Dhaka';
```

### Local development

```env
DATABASE_URL=postgresql://gym:gym_pass@127.0.0.1:5432/gym_db
DB_SSL=false
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
CLIENT_ORIGIN=http://localhost:5173
GYM_TIMEZONE=UTC
```

Start PostgreSQL with `docker compose up -d` or use an existing server.

## 4. Deploying on Render

Render runs one Node service:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Health check path:** `/api/health`

`npm run build` compiles the API to `server/dist` and the SPA to `client/dist`. In production the
Express app serves the SPA and handles client-side routes, so no separate frontend host is required.

Set the environment variables above, deploy, then open:

```
https://<your-service>.onrender.com/api/health
```

Expected response:

```json
{ "status": "ok", "database": "connected", "time": "..." }
```

If health returns 500, the `DATABASE_URL` is wrong, the password is not URL-encoded, or SSL is off.
If it returns 502, check the Render logs for the startup error.

## 5. Troubleshooting sign-in

Work through these in order:

1. **Which table?** The account must exist in `public.users`, not `auth.users`. Run:

   ```sql
   select id, email, role, is_active, left(password_hash, 7) as hash_prefix
     from public.users
    where email = 'you@example.com';
   ```

   `hash_prefix` must start with `$2a$` or `$2b$`. If it is plain text, the password was inserted
   incorrectly; re-run `supabase/create-user.sql`.

2. **Is it active?** `is_active` must be `true`. The API returns `ACCOUNT_DISABLED` otherwise.

3. **Email case.** The API lowercases the email before lookup and the schema enforces lowercase.
   Store and type it consistently.

4. **Password reset.** Re-run `supabase/create-user.sql` with the same email; it updates the hash.

5. **Wrong environment.** Check the Render log line:

   ```
   Connected to PostgreSQL (DATABASE_URL), timezone Asia/Dhaka
   ```

   If it says another host or database, Render is using a stale value.

6. **Rate limit.** 50 sign-in attempts per 15 minutes per IP. Wait or restart the service.

7. **Cookies.** The access token is in `localStorage`; the refresh token is an httpOnly cookie on
   `/api/auth`. If the UI and API are on different sites, set `COOKIE_SAMESITE=none` and use HTTPS.
   Same-site (the default Render single service) needs no change.

8. **CORS.** `CLIENT_ORIGIN` must include the exact origin you open in the browser, including
   `https://` and no trailing slash.

## 6. Handy queries

```sql
-- Staff accounts (never select password_hash in the browser)
select id, name, email, role, is_active from public.users order by id;

-- Who expires in the next 7 days?
select member_code, first_name, last_name, plan_name, subscription_end, days_left
  from public.member_overview
 where membership_status = 'active' and days_left between 0 and 7
 order by days_left;

-- Revenue by month
select to_char(paid_at, 'YYYY-MM') as month, sum(amount) as revenue, count(*) as payments
  from public.payments
 where status = 'paid'
 group by 1 order by 1 desc;

-- Run the expiry sweep manually
select public.run_expiry_job();

-- Confirm RLS is on everywhere
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
```

## 7. Optional: pg_cron

Enable **pg_cron** under Database -> Extensions, then run `supabase/cron.sql`. The Express server also
runs the sweep at 00:05 in `GYM_TIMEZONE` on startup and nightly, so pg_cron is not required.

## 8. Storage (optional, not wired up)

`members.photo_url` accepts a URL. To host images in Supabase, create a public `member-photos`
bucket, upload with the service key from a trusted job, and store the public URL in that column.
Never ship the service key to the React client.
