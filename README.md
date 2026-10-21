# Iron Pulse — Gym Management System

A complete, working gym management app: members, membership plans, subscriptions, payments,
trainers, attendance, expiry alerts, dashboards and reports.

**Stack:** React 18 + Vite + TypeScript · Node.js + Express + TypeScript · MySQL 8 (MariaDB compatible)

---

## Features

- **Admin dashboard** — active members, revenue this month, check-ins today, renewals due, a 12-month
  revenue trend, membership mix and recent activity.
- **Member registration** — contact details, notes, status, and an optional membership sale with
  discount and payment capture in the same transaction. Automatic `GYM-0001` member codes.
- **Plans** — day passes through annual plans, with active/archived state and "sold" counts.
- **Memberships** — sell, renew (new term starts after the current one ends), freeze (extends the end
  date on resume) and cancel. Prevent overlapping memberships per member.
- **Payments** — invoice numbers, cash/card/bank/online, printable receipts, refunds (admin only),
  date/method filters and a collected/refunded summary.
- **Attendance** — quick search check-in, a live "in the gym" list, check-out, duration and history.
  Expired memberships are rejected unless the gym explicitly allows them.
- **Trainers** — profiles, specializations, member rosters, assign/unassign, deactivate.
- **Expiry alerts** — nightly sweep marks lapsed memberships expired and raises in-app notifications
  inside the configurable alert window (default 7 days, plus 3-day and 1-day milestones).
- **Reports** — revenue (by day/month/plan/method), membership growth and churn, attendance (daily,
  unique members, peak hours), trainer activity. Every report exports as CSV.
- **Roles & security** — admin / receptionist / trainer, JWT access + refresh tokens, bcrypt hashes,
  zod validation, rate-limited login, Helmet, parameterized SQL and an audit log.

---

## Quick start

### 1. Prerequisites

- Node.js **20+** (built and tested on 24)
- MySQL **8.x** or MariaDB **10.6+** (built and tested on MariaDB 13)

### 2. Database

Either use Docker:

```bash
docker compose up -d
```

…or a local MySQL/MariaDB. Create the schema and app user:

```sql
CREATE DATABASE gym_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'gym'@'localhost' IDENTIFIED BY 'gym_pass';
CREATE USER 'gym'@'127.0.0.1' IDENTIFIED BY 'gym_pass';
GRANT ALL PRIVILEGES ON gym_db.* TO 'gym'@'localhost';
GRANT ALL PRIVILEGES ON gym_db.* TO 'gym'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 3. Install and configure

```bash
npm install
cp server/.env.example server/.env      # Windows: copy server\.env.example server\.env
```

Edit `server/.env` and set the two JWT secrets. Generate them with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

The seed is safe to re-run: it only creates the admin, plans and demo data when they are missing.

### 5. Run

```bash
npm run dev
```

> **Windows tip:** run these commands **from the project folder**. In PowerShell the prompt should show
> `PS D:\Gym management system>`. An admin PowerShell opens in `C:\WINDOWS\system32`, where npm will
> fail with `Could not read package.json`. Or just double-click **`start.bat`** in the project folder,
> which starts the database and the app for you.

- App: <http://localhost:5173>
- API: <http://localhost:4000> (health check at `/api/health`)

On Windows you can start/stop the project-local MariaDB with `npm run db:start` and `npm run db:stop`
(see the note at the bottom).

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@gym.local` | `Admin@12345` |
| Receptionist | `frontdesk@gym.local` | `Frontdesk@123` |
| Trainer | `trainer@gym.local` | `Trainer@123` |

The seed creates 24 members, 5 plans, 4 trainers, roughly 40 memberships and payments, and attendance
history. **Change these credentials before deploying.**

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | API + Vite dev server together |
| `npm run dev:server` / `npm run dev:client` | Run one side only |
| `npm run build` | Type-check and build API + client |
| `npm start` | Run the built API (serves the client when `NODE_ENV=production`) |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed demo data and accounts |
| `npm run db:start` / `npm run db:stop` | Windows helper for the local MariaDB instance |

---

## Configuration

All settings live in `server/.env` (see `server/.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables secure cookies and serves the built client |
| `PORT` | `4000` | API port |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | MySQL connection |
| `DB_USER` / `DB_PASSWORD` | — | App user credentials |
| `DB_NAME` | `gym_db` | Schema name |
| `JWT_ACCESS_SECRET` | — | At least 24 characters |
| `JWT_REFRESH_SECRET` | — | At least 24 characters |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allow-list (comma-separated) |
| `GYM_TIMEZONE` | `UTC` | Default display timezone |

Gym name, currency, timezone, alert window and the expired-check-in rule are editable in
**Settings** (admin) and stored in the `settings` table.

---

## Project structure

```
.
├── client/                  React SPA
│   ├── src/
│   │   ├── api/             typed HTTP client + endpoint functions
│   │   ├── components/      layout, modals, charts, pickers, UI primitives
│   │   ├── context/         auth, gym settings, toasts
│   │   ├── hooks/           useFetch, useDebounced
│   │   ├── lib/             formatting, status metadata
│   │   └── pages/           Dashboard, Members, MemberDetail, Plans, Subscriptions,
│   │                        Payments, Attendance, Trainers, Reports, Settings, Login
│   └── vite.config.ts       `/api` proxy to the Express server
├── server/
│   ├── src/
│   │   ├── config/          validated environment
│   │   ├── db/              pool, SQL migrations, seed
│   │   ├── jobs/            nightly expiry sweep
│   │   ├── lib/             errors, helpers, JWT, audit
│   │   ├── middleware/      auth/RBAC, error handling
│   │   ├── routes/          one router per resource
│   │   ├── services/        subscription + payment transactions
│   │   ├── app.ts           express app
│   │   └── server.ts        startup, cron, graceful shutdown
│   └── .env.example
├── scripts/                 Windows local-database helpers
├── supabase/                PostgreSQL schema, seed and pg_cron job for Supabase
├── docker-compose.yml       MySQL 8.4 service
├── PLAN.md                  original plan and delivery phases
└── README.md
```

No ORM: queries are parameterized SQL through `mysql2`, with a small migration runner
(`server/src/db/migrations.ts`) and transactions around money-changing operations.

---

## Data model

| Table | Purpose |
|---|---|
| `users` | Staff accounts (admin / receptionist / trainer) |
| `members` | Gym members, soft-deleted via `deleted_at` |
| `plans` | Membership products (duration + price) |
| `subscriptions` | A member's membership term and status |
| `payments` | Invoices, amounts, method and status |
| `trainers` | Trainer profiles |
| `trainer_assignments` | Trainer ↔ member assignments with history |
| `attendance` | Check-in / check-out records |
| `notifications` | In-app expiry alerts |
| `audit_log` | Who changed what |
| `settings` | Gym configuration key/value |

### Membership rules

1. A member can only have **one active/upcoming membership at a time**.
2. **Renewing** creates a new row starting the day after the current membership ends; it never
   edits the old term. Paying for a renewal in advance is supported.
3. **Freezing** pauses access; **resuming** extends the end date by the number of frozen days.
4. `final_amount = price_at_purchase − discount`; discounts cannot exceed the plan price.
5. A new membership and its payment are written in **one transaction**.
6. Check-in requires an active membership and no open visit; expired members are blocked unless
   *Allow check-in with expired membership* is enabled in Settings.
7. Archiving a member cancels active memberships, ends trainer assignments and keeps history.

---

## API overview

All routes are under `/api` and require a bearer token except `/auth/login`, `/auth/refresh`,
`/health` and `/public/config`.

```
POST   /auth/login | /auth/refresh | /auth/logout    GET /auth/me
GET    /dashboard/stats
CRUD   /members, /members/:id (detail includes subscriptions, payments, attendance, trainers)
GET    /plans | POST /plans | PATCH/DELETE /plans/:id
GET    /subscriptions | POST /subscriptions | PATCH /subscriptions/:id  {action: freeze|unfreeze|cancel}
GET    /subscriptions/expiring?days=7
GET    /payments | POST /payments | POST /payments/:id/refund
GET    /attendance/today | GET /attendance | POST /attendance/check-in | PATCH /attendance/:id/check-out
CRUD   /trainers, /trainers/:id/assign, /trainers/:id/members
GET    /notifications | PATCH /notifications/:id/read | POST /notifications/read-all
GET    /reports/{revenue|members|attendance|trainers}  (+ /export for CSV)
GET    /settings | PUT /settings
GET    /users | POST /users | PATCH/DELETE /users/:id        (admin)
GET    /health
```

List endpoints return `{ data, page, limit, total, totalPages }`; errors return
`{ error: { code, message, details? } }`.

### Role matrix

| Area | Admin | Receptionist | Trainer |
|---|---|---|---|
| Dashboard, members (read), attendance | ✓ | ✓ | ✓ |
| Create/edit members, memberships, payments | ✓ | ✓ | — |
| Refunds, plans, users, settings | ✓ | — | — |
| Trainer rosters | ✓ | ✓ | read |
| Reports | ✓ | ✓ | — |

---

## Expiry alerts

- On start-up and every night at **00:05**, the job marks memberships with `end_date < today` as
  `expired` and creates notifications for memberships inside the alert window.
- Alert milestones: the configured lead day (default 7) plus 7/3/1 days, deduplicated per
  subscription by a unique index, so re-runs are safe.
- Notifications appear in the topbar bell and on the dashboard. The dashboard's "expiring" count and
  list use the same configured window.

---

## Production

```bash
npm run build
NODE_ENV=production PORT=4000 npm start
```

In production the Express server serves the built SPA from `client/dist` and handles SPA routing, so
one process (behind nginx/Caddy for TLS) is enough.

Checklist:

- Set strong `JWT_*` secrets and change the seeded passwords.
- Set `CLIENT_ORIGIN` to your real domain(s).
- Put MySQL on a private network and take nightly `mysqldump` backups.
- Use HTTPS — refresh cookies are `secure` in production.
- Run migrations as part of your deploy (`npm run db:migrate`).
- Don't run `db:seed` in production.

---

## Supabase / PostgreSQL

The app ships with a MySQL backend. A tested PostgreSQL version of the schema lives in
`supabase/` (`schema.sql`, `seed.sql`, `cron.sql`) with a full porting guide in
[`SUPABASE.md`](SUPABASE.md).

Running on Supabase requires switching the API from `mysql2` to `pg` — the SQL alone is not enough,
because the current code uses MySQL-only syntax and unquoted camelCase aliases. See `SUPABASE.md`
§4 for the exact list of changes.

---

## Notes, limits and next steps

- Payments are recorded manually; there is no gateway integration.
- Alerts are in-app only — no email/SMS/WhatsApp provider is wired up.
- Member photos are URLs, not file uploads.
- Single location; the plan anticipates `branch_id` but it is not implemented.
- Times are stored in the database server's local time; `GYM_TIMEZONE` is for display/config only.
- No automated test suite is included; the API was smoke-tested end-to-end (registration, renewal,
  freeze/unfreeze, payments, refunds, attendance guards, RBAC, reports, CSV export).
- Audit entries are written but have no UI yet.

Sensible next steps: email/SMS alerts, a payment gateway, QR check-in, multi-branch support, class
scheduling, and an automated integration test suite.

---

## Local setup on this machine (Windows)

This workspace was built and seeded against a **project-local MariaDB 13** instance:

- Binaries: `C:\Program Files\MariaDB 13.0\bin`
- Data directory: `.tools/mariadb-data` (git-ignored)
- Listens on `127.0.0.1:3306`, `root` with no password; the app uses `gym` / `gym_pass`
- Start it with `npm run db:start`, stop it with `npm run db:stop`

If you prefer your own MySQL server, point `server/.env` at it and ignore these helpers.
