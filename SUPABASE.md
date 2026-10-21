# Running on Supabase (PostgreSQL)

Supabase runs **PostgreSQL**, not MySQL. This folder contains a Postgres version of the schema,
demo data, and the expiry job, all tested against PostgreSQL 17.

```
supabase/
├── schema.sql   tables, indexes, constraints, triggers, views, RLS, expiry functions
├── seed.sql     plans, staff accounts, trainers, 10 demo members, payments, attendance
└── cron.sql     optional pg_cron schedule for the nightly expiry sweep
```

## ⚠️ Read this first

The SQL works. The **Express API does not yet speak Postgres** — it uses `mysql2` and MySQL-specific
SQL. So:

- ✅ You can create the database in Supabase and browse/edit data there today.
- ❌ The app will not start against Supabase until the API is ported (`mysql2` → `pg`).
- ✅ Your local MySQL setup keeps working unchanged in the meantime.

Section 4 lists exactly what the port involves, and I can do it for you (see the end).

---

## 1. Create the database

1. Create a project at [supabase.com](https://supabase.com) and wait for it to finish provisioning.
2. Open **SQL Editor → New query**.
3. Paste all of `supabase/schema.sql` and run it.
4. Paste all of `supabase/seed.sql` and run it. Expect a summary:

   ```
    members | subscriptions | payments | attendance | alerts
   ---------+---------------+----------+------------+--------
         10 |             9 |        9 |         12 |      3
   ```

5. Optional: enable **pg_cron** in *Database → Extensions*, then run `supabase/cron.sql`.

Both files are safe to re-run: the schema is idempotent, and the seed refuses to run twice.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@gym.local` | `Admin@12345` |
| Receptionist | `frontdesk@gym.local` | `Frontdesk@123` |
| Trainer | `trainer@gym.local` | `Trainer@123` |

The bcrypt hashes are pre-computed and verified. **Change the passwords before real use.**

---

## 2. What the schema includes

- All 11 tables with foreign keys, check constraints and indexes.
- **`subscriptions_no_overlap`** — a GiST exclusion constraint that blocks overlapping
  active/frozen memberships per member, while still allowing an upcoming renewal.
- **`attendance_one_open_visit`** — a partial unique index so a member can't have two open visits.
- `touch_updated_at` triggers on every table that has `updated_at`.
- `member_overview` view with the derived `membership_status` and `days_left`.
- `expire_memberships()`, `generate_expiry_alerts()`, `run_expiry_job()` — the expiry sweep.
- **RLS enabled on all 11 tables with no policies**, so the public anon key can read nothing.
  The API connects as `postgres`/`service_role`, which bypasses RLS.

### Verified behaviour

| Test | Result |
|---|---|
| Fresh schema + seed on PostgreSQL 17 | passes |
| Schema run twice | passes (idempotent) |
| Seed run twice | refused with a clear error |
| Overlapping active membership insert | rejected by `subscriptions_no_overlap` |
| Second open visit insert | rejected by `attendance_one_open_visit` |
| Non-overlapping renewal insert | allowed |
| Expiry job run twice | second run creates 0 duplicate alerts |
| Demo bcrypt hashes | all three verify |

---

## 3. Connection settings

**Settings → Database → Connection string** in Supabase. Use the **Session pooler** (port 5432)
or the **Direct connection** for a long-running Node server; the transaction pooler (6543) is meant
for serverless.

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

or as individual values:

```env
DB_HOST=aws-0-<region>.pooler.supabase.com
DB_PORT=5432
DB_USER=postgres.<project-ref>
DB_PASSWORD=<your-database-password>
DB_NAME=postgres
DB_SSL=true
```

Get the password from **Settings → Database → Database password** (reset it if lost).
Never put the `service_role` key or the DB password in the React client.

---

## 4. Porting the API to Postgres

The API is the only thing between the app and Supabase. `mysql2` cannot talk to Postgres; the
database layer must switch to `pg`. There is more than a connection string involved:

### 4.1 Driver

```bash
npm install pg --workspace server
npm install -D @types/pg --workspace server
```

Rewrite `server/src/db/pool.ts` around `new Pool(...)`. A helper that converts `?` placeholders to
`$1, $2…` lets most query strings stay readable:

```ts
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
```

### 4.2 Dialect differences in this codebase

| MySQL (current) | PostgreSQL (Supabase) | Where |
|---|---|---|
| `?` placeholders | `$1, $2, …` | every route |
| `insertId` / `affectedRows` | `RETURNING id` / `rowCount` | every insert/update |
| `INSERT IGNORE` | `ON CONFLICT DO NOTHING` | expiry job |
| `ON DUPLICATE KEY UPDATE value = VALUES(value)` | `ON CONFLICT (key) DO UPDATE SET value = excluded.value` | settings route |
| `CURDATE()` | `CURRENT_DATE` | members, subscriptions, dashboard, reports, attendance, jobs |
| `DATEDIFF(a, b)` | `(a::date - b::date)` | memberships, dashboard, expiry |
| `DATE_ADD(x, INTERVAL ? DAY)` | `x + make_interval(days => ?)` | members list, dashboard, subscriptions |
| `DATE_SUB(CURDATE(), INTERVAL 11 MONTH)` | `CURRENT_DATE - interval '11 months'` | dashboard |
| `DATE_FORMAT(x, '%Y-%m')` | `to_char(x, 'YYYY-MM')` | payments summary, reports, dashboard |
| `DATE(x)` | `x::date` | payments, attendance, reports |
| `HOUR(x)` | `extract(hour from x)` | attendance report |
| `TIMESTAMPDIFF(MINUTE, a, b)` | `extract(epoch from (b - a)) / 60` | attendance report |
| `tinyint(1)` / `0` / `1` | `boolean` / `false` / `true` | users, plans, settings |
| `JSON` column | `jsonb` | audit log |
| `GROUP BY alias` | allowed (same) | reports |

### 4.3 The alias trap

PostgreSQL folds unquoted identifiers to lowercase. Every camelCase alias must be quoted, or the
JSON keys change and the React client breaks:

```sql
-- wrong on Postgres: returns "membercode", "firstname", "daysleft"
select member_code as memberCode, first_name as firstName from members;

-- correct
select member_code as "memberCode", first_name as "firstName" from members;
```

This touches about 60 aliases across `routes/members.ts`, `subscriptions.ts`, `payments.ts`,
`attendance.ts`, `trainers.ts`, `dashboard.ts`, `notifications.ts` and `users.ts`.

### 4.4 Type parsers

`pg` returns `numeric`, `bigint`/`COUNT(*)` as strings and dates as `Date` objects. Set parsers so
the response shape stays identical to today's:

```ts
import { types } from 'pg';
types.setTypeParser(1700, (v) => Number(v));  // numeric
types.setTypeParser(20, (v) => Number(v));    // int8 / COUNT
types.setTypeParser(1082, (v) => v);          // date → 'YYYY-MM-DD'
types.setTypeParser(1114, (v) => v);          // timestamp
types.setTypeParser(1184, (v) => v);          // timestamptz
```

### 4.5 Other adjustments

- `server/src/db/migrations.ts` is MySQL DDL — Supabase uses `supabase/schema.sql` instead. Point
  `db:migrate` at a Postgres migration script or drop it in favour of `supabase` migrations.
- `server/src/db/seed.ts` is MySQL-specific; `supabase/seed.sql` replaces it.
- `db:start` / `db:stop` scripts and `docker-compose.yml` are only for the local MySQL setup.
- Timezone: `timestamptz` values are stored in UTC. Report grouping should convert to the gym's
  timezone, e.g. `(paid_at at time zone 'Asia/Dhaka')::date`.
- `settings.allow_expired_checkin` is stored as text `'true'`/`'false'` — same as today.

**Files affected:** `db/pool.ts`, `services/billing.ts`, `jobs/expiry.ts`, `db/seed.ts`,
`db/migrate.ts`, and all 11 files in `routes/`.

### 4.6 Env

```env
NODE_ENV=production
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
CLIENT_ORIGIN=https://your-frontend.example.com
```

Remove `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` if you switch to a single URL.

---

## 5. Supabase Auth and Storage (optional)

This app ships its own auth: bcrypt + JWT + roles in `users.role`. That is fine to keep.

- **Supabase Auth** would replace the `users` login flow with `auth.users`, and roles would move to
  JWT claims or an `app_metadata.role`. It is a real refactor, not a config toggle.
- **Storage** is a good fit for member photos later: create a `member-photos` bucket, upload from the
  API with the service key, store the public URL in `members.photo_url`. The column already exists.
- If you later query Supabase directly from the browser, you must add RLS policies — right now the
  anon key is intentionally locked out.

---

## 6. Deploying

| Piece | Suggested host |
|---|---|
| PostgreSQL | Supabase (already) |
| Express API | Render, Railway, Fly.io, or a small VPS |
| React build (`client/dist`) | Vercel, Netlify, Cloudflare Pages |

Set `CLIENT_ORIGIN` to the deployed frontend and put the API behind HTTPS. Because auth uses an
httpOnly refresh cookie, the API and client should be on the same site or you need a custom cookie
`SameSite`/domain setup.

---

## 7. Handy queries

```sql
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

-- Check RLS is on everywhere
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
```

---

## Want me to finish the port?

Say the word and I'll switch the API to `pg`, quote the aliases, replace the MySQL functions, add
`RETURNING id`, and re-run the same end-to-end smoke suite against your Supabase database — so the
whole app runs on Supabase rather than just the schema.
