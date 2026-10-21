# Iron Pulse: Gym Management System

A complete gym management app: members, membership plans, subscriptions, payments, trainers,
attendance, expiry alerts, dashboards and reports.

**Stack:** React 18 + Vite + TypeScript · Node.js + Express + TypeScript · PostgreSQL 15+ (Supabase compatible)

---

## Features

- **Admin dashboard**: active members, revenue this month, check-ins today, renewals due, a 12-month
  revenue trend, membership mix and recent activity.
- **Member registration**: contact details, notes, status, and an optional membership sale with
  discount and payment capture in the same transaction. Automatic `GYM-0001` member codes.
- **Plans**: day passes through annual plans, with active/archived state and sold counts.
- **Memberships**: sell, renew (new term starts after the current one ends), freeze (extends the end
  date on resume) and cancel. The database prevents overlapping active memberships per member.
- **Payments**: invoice numbers, cash/card/bank/online, printable receipts, refunds (admin only),
  date/method filters and a collected/refunded summary.
- **Attendance**: quick search check-in, a live "in the gym" list, check-out, duration and history.
  Expired memberships are rejected unless the gym explicitly allows them.
- **Trainers**: profiles, specializations, member rosters, assign/unassign, deactivate.
- **Expiry alerts**: nightly sweep marks lapsed memberships expired and raises in-app notifications
  inside the configurable alert window.
- **Reports**: revenue (by day/month/plan/method), membership growth and churn, attendance and
  trainer activity. Every report exports as CSV.
- **Roles and security**: admin / receptionist / trainer, JWT access + refresh tokens, bcrypt hashes,
  zod validation, rate-limited login, Helmet, parameterized SQL and an audit log.

---

## Quick start

### 1. Prerequisites

- Node.js **20+**
- PostgreSQL **15+** (local, Docker, or Supabase)

### 2. Database

With Docker:

```bash
docker compose up -d
```

Or use any PostgreSQL server and create a database. Then apply the schema:

```bash
cp server/.env.example server/.env     # Windows: copy server\.env.example server\.env
# edit server/.env: set DATABASE_URL or DB_* and the two JWT secrets
npm install
npm run db:migrate
```

`npm run db:migrate` reads `supabase/schema.sql`. It is idempotent.

Optional demo data (10 members, 3 staff, plans, payments, attendance):

```bash
npm run db:seed
```

### 3. Create a staff login

Supabase Auth users are separate. Create an app account with either:

```bash
npm run db:user -- "Alex Morgan" admin@example.com "StrongPass123!" admin
```

or run `supabase/create-user.sql` in the Supabase SQL editor. Roles: `admin`, `receptionist`,
`trainer`.

### 4. Run

```bash
npm run dev
```

- App: <http://localhost:5173>
- API: <http://localhost:4000> (health: `/api/health`)

> **Windows tip:** run commands from the project folder (`PS D:\Gym management system>`).

### Demo accounts (only after `npm run db:seed`)

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@gym.local` | `Admin@12345` |
| Receptionist | `frontdesk@gym.local` | `Frontdesk@123` |
| Trainer | `trainer@gym.local` | `Trainer@123` |

**Change or delete these before deploying.**

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | API + Vite dev server together |
| `npm run dev:server` / `npm run dev:client` | Run one side only |
| `npm run build` | Type-check and build API + client |
| `npm start` | Run the built API (serves the client when `NODE_ENV=production`) |
| `npm run db:migrate` | Apply `supabase/schema.sql` |
| `npm run db:seed` | Seed demo data from `supabase/seed.sql` |
| `npm run db:user -- "Name" email password role` | Create or reset a staff login |
| `npm run db:start` / `npm run db:stop` | Docker PostgreSQL helper |
| `scripts/smoke.ps1` | End-to-end API smoke test (mutates a test database) |

---

## Configuration

All settings live in `server/.env` (see `server/.env.example`). Render/Supabase values are documented
in [`SUPABASE.md`](SUPABASE.md).

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables secure cookies and serves the built client |
| `PORT` | `4000` | API port |
| `DATABASE_URL` | none | Postgres connection string; preferred |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `5432` | Fallback when `DATABASE_URL` is unset |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `postgres` / empty / `postgres` | Fallback connection values |
| `DB_SSL` | `false` | Set `true` for Supabase or any TLS database |
| `DB_POOL_MAX` | `10` | Connection pool size |
| `JWT_ACCESS_SECRET` | required | At least 24 characters |
| `JWT_REFRESH_SECRET` | required | At least 24 characters |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS allow-list (comma-separated) |
| `GYM_TIMEZONE` | `UTC` | Database session timezone, cron timezone and report grouping |
| `COOKIE_SAMESITE` | `lax` | Use `none` only for a cross-site UI over HTTPS |

Gym name, currency, timezone, alert window and the expired-check-in rule are editable in **Settings**
(admin) and stored in the `settings` table.

Supabase's `SUPABASE_URL` and anon key are **not** read by this API. Only the Postgres connection
string is needed.

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
│   │   ├── db/              pg pool, migrate/seed wrappers, create-user CLI
│   │   ├── jobs/            nightly expiry sweep
│   │   ├── lib/             errors, helpers, JWT, audit
│   │   ├── middleware/      auth/RBAC, error handling
│   │   ├── routes/          one router per resource
│   │   ├── services/        subscription + payment transactions
│   │   ├── app.ts           express app
│   │   └── server.ts        startup, cron, graceful shutdown
│   └── .env.example
├── supabase/                PostgreSQL schema, seed, create-user, cleanup and pg_cron
├── scripts/                 smoke test and local helpers
├── docker-compose.yml       PostgreSQL 17 service
├── SUPABASE.md              Supabase + Render deployment and troubleshooting
└── README.md
```

No ORM: queries are parameterized SQL through `pg`, with transactions around money-changing
operations.

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
| `trainer_assignments` | Trainer to member assignments with history |
| `attendance` | Check-in / check-out records |
| `notifications` | In-app expiry alerts |
| `audit_log` | Who changed what |
| `settings` | Gym configuration key/value |

### Membership rules

1. A member can only have **one active/upcoming membership at a time**.
2. **Renewing** creates a new row starting the day after the current membership ends.
3. **Freezing** pauses access; **resuming** extends the end date by the number of frozen days.
4. `final_amount = price_at_purchase - discount`; discounts cannot exceed the plan price.
5. A new membership and its payment are written in **one transaction**.
6. Check-in requires an active membership and no open visit; expired members are blocked unless
   *Allow check-in with expired membership* is enabled.
7. Archiving a member cancels active memberships, ends trainer assignments and keeps history.

---

## API overview

All routes are under `/api` and require a bearer token except `/auth/login`, `/auth/refresh`,
`/health` and `/public/config`.

```
POST   /auth/login | /auth/refresh | /auth/logout    GET /auth/me
GET    /dashboard/stats
CRUD   /members, /members/:id
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
| Dashboard, members (read), attendance | yes | yes | yes |
| Create/edit members, memberships, payments | yes | yes | no |
| Refunds, plans, users, settings | yes | no | no |
| Trainer rosters | yes | yes | read |
| Reports | yes | yes | no |

---

## Interface principles

The UI is deliberately plain and document-like:

- **Palette:** warm paper (`#f7f5f0`), white surfaces, deep evergreen primary (`#145c4a`), copper
  accent (`#a86537`). Solid colours only, no purple-blue gradients.
- **Type:** one system sans stack (`Segoe UI`, `-apple-system`, `Helvetica Neue`, Arial). No Inter,
  no Space Grotesk, no serif italics.
- **Surfaces:** flat cards with one neutral border and one soft shadow. No glassmorphism or
  translucent blur.
- **Layout:** 4/8/12/16/20/24/32/40 px spacing scale, one card radius, one control radius.
- **Content:** text-first navigation and stat cards; icons only where they carry an action.
  No emoji headings, no badge above the title, no marketing copy, no em dashes.
- **Motion:** no scroll-triggered fades or cursor effects. Only a spinner and a skeleton pulse.

---

## Expiry alerts

- On startup and every night at **00:05** in `GYM_TIMEZONE`, the job marks memberships with
  `end_date < today` as `expired` and creates notifications for memberships inside the alert window.
- Alert milestones: the configured lead day (default 7) plus 7/3/1 days, deduplicated per
  subscription by a unique index, so re-runs are safe.
- Notifications appear in the topbar bell and on the dashboard.

---

## Production

```bash
npm run build
NODE_ENV=production PORT=4000 npm start
```

In production the Express server serves the built SPA from `client/dist` and handles SPA routing, so
one process behind HTTPS is enough. See [`SUPABASE.md`](SUPABASE.md) for the Render + Supabase
checklist.

Checklist:

- Set strong `JWT_*` secrets and remove the demo accounts.
- Set `CLIENT_ORIGIN` to your real domain(s).
- Use `DATABASE_URL` with SSL; never ship the service key or DB password to the client.
- Use HTTPS. Refresh cookies are `secure` in production.
- Run migrations as part of your deploy (`npm run db:migrate`).
- Do not run `db:seed` in production.
- Take regular database backups (Supabase has daily backups on paid plans).

---

## Notes and limits

- Payments are recorded manually; there is no gateway integration.
- Alerts are in-app only; no email/SMS/WhatsApp provider is wired up.
- Member photos are URLs, not file uploads.
- Single location; `branch_id` is not implemented.
- No automated test suite is checked in. The API and UI were smoke-tested end to end (login,
  registration, renewal, freeze/unfreeze, payments, refunds, attendance guards, RBAC, reports, CSV,
  and page rendering).
- Audit entries are written but have no UI yet.

Sensible next steps: email/SMS alerts, a payment gateway, QR check-in, multi-branch support, class
scheduling, and an automated integration test suite.
