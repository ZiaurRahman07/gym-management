# Gym Management System — Implementation Plan

> **Status: implemented.** See `README.md` for setup, demo accounts and the API overview.
> Deviations from the original plan: no Knex (a small SQL migration runner is used instead), member
> photos are URLs rather than uploads, QR check-in was left out of v1, and there is no automated test
> suite yet (the API was smoke-tested end to end).

**Goal:** A web app to manage gym members, membership plans, subscriptions, payments, trainers, and
attendance, with an admin dashboard, expiry alerts, and reports.

**Stack:** React (Vite) + Node.js/Express + MySQL
**Target:** Single-gym deployment first, structured so multi-branch can be added later.

---

## 1. Assumptions

These are the defaults the plan is built on. Anything marked ⚠ is worth confirming before Phase 3.

| Area | Assumption |
|---|---|
| Tenancy | One gym, one location. `branch_id` reserved but not exposed in v1. |
| Roles | `admin` (full access), `receptionist` (members, payments, attendance), `trainer` (own members + attendance only). |
| Auth | Email + password, JWT access token (15 min) + refresh token (7 days, httpOnly cookie). |
| Plans | Fixed-duration plans (30/90/180/365 days) with a price. No class/session packages in v1. |
| Payments | Recorded manually (cash/card/bank transfer) by staff. No online gateway in v1. ⚠ |
| Currency | Configurable via `CURRENCY` env var; money stored as `DECIMAL(10,2)`. |
| Alerts | In-app notifications + dashboard widget. No email/SMS provider in v1. ⚠ |
| Attendance | Manual check-in by staff, plus optional QR code per member (Phase 6). |
| Timezone | Store UTC, display in gym's local timezone (`GYM_TIMEZONE`). |

---

## 2. Architecture

```
React SPA (Vite, TS)
   │  fetch /axios + JWT
   ▼
Express API  ──►  MySQL 8
   │
   ├─ cron job (daily): expire subscriptions, generate alerts
   └─ services layer: transactions for payment+subscription
```

**Key choices**

- **TypeScript on both sides** — shared request/response types in a `shared/` folder.
- **MySQL access:** `mysql2/promise` pool + **Knex** for migrations/seeds only. All queries parameterized. (Alternative: Prisma — better DX, heavier migration story. Knex recommended for SQL control.)
- **Validation:** `zod` schemas reused between server validators and client forms.
- **Money:** never float. `DECIMAL(10,2)` in DB, integer cents or decimal strings in JS.
- **Dates:** `DATE` for subscription boundaries, `DATETIME` (UTC) for events.
- **Soft deletes** on members (`deleted_at`) so payment/attendance history survives.
- **Transactions:** creating a subscription + payment is one DB transaction.

---

## 3. Data model

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Staff logins | `id`, `name`, `email` (unique), `password_hash`, `role`, `is_active` |
| `members` | Gym members | `id`, `member_code` (unique, e.g. `GYM-00042`), `first_name`, `last_name`, `email`, `phone`, `dob`, `gender`, `address`, `photo_url`, `emergency_contact`, `join_date`, `status`, `notes`, `deleted_at` |
| `plans` | Membership products | `id`, `name`, `duration_days`, `price`, `description`, `is_active` |
| `subscriptions` | A member's active/historical membership | `id`, `member_id`, `plan_id`, `start_date`, `end_date`, `status` (`active`/`expired`/`frozen`/`cancelled`), `price_at_purchase`, `discount`, `final_amount`, `created_by` |
| `payments` | Money received | `id`, `invoice_no` (unique), `member_id`, `subscription_id` (nullable), `amount`, `method`, `status` (`paid`/`pending`/`refunded`/`failed`), `paid_at`, `notes`, `recorded_by` |
| `trainers` | Trainer profiles | `id`, `user_id` (nullable), `name`, `email`, `phone`, `specialization`, `hire_date`, `status` |
| `trainer_assignments` | Trainer ↔ member | `id`, `trainer_id`, `member_id`, `assigned_at`, `ended_at`, `notes` |
| `attendance` | Check-in log | `id`, `member_id`, `check_in_at`, `check_out_at`, `method` (`manual`/`qr`), `recorded_by` |
| `notifications` | Expiry + system alerts | `id`, `member_id`, `subscription_id`, `type`, `title`, `body`, `read_at`, `created_at` |
| `audit_log` | Who changed what | `id`, `user_id`, `action`, `entity`, `entity_id`, `meta` (JSON), `created_at` |
| `settings` | Gym name, timezone, alert lead days | `key` (PK), `value` |

**Indexes:** `members(member_code)`, `members(phone)`, `members(status)`, `subscriptions(member_id, end_date)`,
`subscriptions(status, end_date)`, `payments(paid_at)`, `payments(member_id)`, `attendance(member_id, check_in_at)`,
`attendance(check_in_at)`.

**Business rules**

1. A member has **at most one `active` subscription** — enforced in application logic inside a transaction (MySQL can't express this as a simple unique index).
2. Extending a membership creates a **new subscription** starting the day after the current one ends (renewal), not an update.
3. `final_amount = price_at_purchase - discount`; reject negative totals.
4. A payment can exist without a subscription (e.g. merchandise/day pass) but a *new subscription* requires a payment unless marked `comp`.
5. Attendance check-in is rejected for members with no active subscription (configurable via `settings.allow_expired_checkin`).
6. Deleting/archiving a member cancels their active subscription but keeps all history.

---

## 4. API surface

All routes under `/api`, JSON, bearer token required except `/auth/login`.

```
POST   /auth/login                POST /auth/refresh      POST /auth/logout   GET /auth/me
GET    /users                     POST /users             PATCH /users/:id    DELETE /users/:id     (admin)

GET    /members?q=&status=&page=&limit=&expiringIn=
POST   /members                   GET /members/:id        PATCH /members/:id  DELETE /members/:id
GET    /members/:id/subscriptions /payments  /attendance
GET    /members/:id/qr                                                      (Phase 6)

GET    /plans                     POST /plans             PATCH /plans/:id    DELETE /plans/:id

GET    /subscriptions?status=&memberId=&from=&to=
POST   /subscriptions             (creates sub + optional payment, transactional)
PATCH  /subscriptions/:id         (renew / freeze / cancel)
GET    /subscriptions/expiring?days=7

GET    /payments?from=&to=&method=&memberId=
POST   /payments                  GET /payments/:id       POST /payments/:id/refund
GET    /payments/summary?from=&to=&groupBy=day|month|plan|method

GET    /trainers                  POST /trainers          PATCH /trainers/:id  DELETE /trainers/:id
POST   /trainers/:id/assign       DELETE /trainers/:id/assign/:memberId
GET    /trainers/:id/members

POST   /attendance/check-in       PATCH /attendance/:id/check-out
GET    /attendance?date=&memberId=   GET /attendance/today

GET    /dashboard/stats           (cards + charts, single aggregate endpoint)
GET    /notifications             PATCH /notifications/:id/read   POST /notifications/read-all

GET    /reports/revenue?from=&to=&groupBy=day|month|plan|method
GET    /reports/members?from=&to=          (new, active, churned)
GET    /reports/attendance?from=&to=       (daily counts, peak hours)
GET    /reports/trainers?from=&to=         (assigned members, check-ins)
GET    /reports/:name/export?format=csv

GET    /health
```

**Conventions:** list endpoints return `{ data, page, limit, total }`; errors return
`{ error: { code, message, details? } }` with proper HTTP status.

---

## 5. Frontend structure

```
client/src/
  api/            axios client + typed endpoint functions
  components/     Button, Table, Modal, FormField, StatCard, EmptyState, Pagination
  features/       members/ plans/ subscriptions/ payments/ trainers/ attendance/ reports/
  layouts/        AuthLayout, AppLayout (sidebar + topbar)
  pages/          Login, Dashboard, MembersList, MemberDetail, MemberForm, Plans,
                  Subscriptions, Payments, Trainers, Attendance, Reports, Settings, Users
  hooks/          useAuth, useDebounce, usePagination, useToast
  lib/            permissions.ts, formatters.ts (money, dates), validators.ts
  routes.tsx      protected routes + role guards
```

**Screens (v1)**

1. **Login**
2. **Dashboard** — active members, revenue this month, check-ins today, expiring in 7 days, revenue chart (last 12 months), recent payments, alert list.
3. **Members** — searchable/filterable table, add/edit modal or page, detail page with tabs (Overview / Subscriptions / Payments / Attendance).
4. **Plans** — CRUD table.
5. **Subscriptions** — list with status + expiry badges; new/renew flow with plan picker and payment capture.
6. **Payments** — list, filter by date range, record payment, receipt print view.
7. **Attendance** — today's console: quick member search → check in, list of who's in the gym, check out.
8. **Trainers** — CRUD, assign members, view assigned roster.
9. **Reports** — date-range pickers, charts + tables, CSV export.
10. **Settings / Users** — admin only.

**UI:** Tailwind CSS + shadcn/ui (or MUI) for speed, Recharts for charts, React Hook Form + zod for forms.

---

## 6. Expiry alerts

- Nightly cron (node-cron, `0 1 * * *` gym time):
  1. Mark `subscriptions` with `end_date < today` and status `active` → `expired`.
  2. For subscriptions ending in **7, 3, 1** days (configurable in `settings`), insert a
     `notifications` row (deduplicated by `subscription_id + type`).
- Dashboard shows "Expiring soon" card + alert list; `/subscriptions/expiring` powers the member table filter.
- Bell icon in topbar shows unread count.
- Job is idempotent and safe to re-run; log each run to `audit_log` or a `job_runs` table.

---

## 7. Reports

| Report | Contents |
|---|---|
| Revenue | Total, by day/month, by plan, by payment method; date range |
| Memberships | New joins, active count, expiring, churned (no renewal after expiry) |
| Attendance | Daily check-ins, unique members, peak hours heatmap, average visit duration |
| Trainers | Members per trainer, check-ins by trainer's roster |
| Outstanding | Subscriptions without a `paid` payment (data-quality report) |

All reports: date range picker, on-screen table + chart, CSV export (stream generated server-side).

---

## 8. Delivery phases

| Phase | Scope | Done when |
|---|---|---|
| **0. Foundation** | Monorepo (`client/`, `server/`, `shared/`), Vite + TS, Express + TS (tsx watch), Knex migrations, seed admin + demo plans, `.env.example`, Docker Compose for MySQL, `/health` | `npm run dev` starts both; migrations + seed run clean |
| **1. Auth & shell** | Login, JWT + refresh, RBAC middleware, protected routes, app layout, users CRUD (admin) | Can log in as each role and see role-appropriate nav |
| **2. Members & plans** | Member CRUD + search/pagination, photo upload (local disk), auto `member_code`, plan CRUD | Full member lifecycle manageable from UI |
| **3. Subscriptions & payments** | Transactional new/renew, freeze/cancel, payment recording, invoice numbers, receipts | Renewing a member creates sub + payment atomically; balances reconcile |
| **4. Attendance** | Check-in/out, today console, per-member history, active-subscription guard | Front desk can run a full day of check-ins |
| **5. Trainers** | Trainer CRUD, assignments, roster view | Members can be assigned/unassigned; history retained |
| **6. Dashboard & alerts** | Stats endpoint, charts, cron job, notifications, QR check-in (optional) | Dashboard reflects real data; cron run produces alerts |
| **7. Reports** | Five reports + CSV export | Numbers match DB queries; export opens correctly in Excel |
| **8. Hardening & ship** | Validation audit, rate limiting, helmet/CORS, audit log, tests (API integration + key UI flows), seed/demo data, README, deployment (VPS + PM2/nginx or Docker) | Test suite green; deployed behind HTTPS with nightly DB backup |

Rough effort for one developer: **Phases 0–4 ≈ 2 weeks**, **5–7 ≈ 1 week**, **8 ≈ 3–4 days**.

---

## 9. Cross-cutting concerns

- **Security:** argon2/bcrypt hashing, short-lived access tokens, refresh rotation, `helmet`, CORS allowlist, `express-rate-limit` on auth, zod validation on every input, parameterized SQL only, uploads validated by MIME + size, RBAC checked in middleware *and* queried by owner (`trainer` sees only own roster).
- **Audit:** wrap mutating routes in an audit middleware writing `audit_log`.
- **Error handling:** central error handler, no stack traces to client in production, request IDs in logs (pino).
- **Testing:** Vitest + Supertest against a disposable MySQL schema per run; React Testing Library for forms and guards. Minimum: auth, subscription/payment transaction, expiry job, attendance guard.
- **DevOps:** Docker Compose (mysql + api + client static), `.env` per environment, `npm run db:migrate` on release, nightly `mysqldump` backup, seed script for demo data.
- **Performance:** paginate everything, avoid N+1 (joins for list views), cache dashboard aggregates for 60s if needed, indexes above.

---

## 10. Open questions

1. **Payments:** manual recording only, or integrate a gateway (Stripe / bKash / SSLCommerz / local)?
2. **Alerts:** in-app only, or also email/SMS/WhatsApp (needs a provider + templates)?
3. **Multi-branch:** one location now, or branches with per-branch staff/reports?
4. **Classes & trainers:** are group classes/schedules in scope, or just trainer-to-member assignment?
5. **Currency, locale, and timezone** for the gym.
6. **Deployment target:** VPS, shared hosting (cPanel), or a cloud PaaS?

---

## 11. Suggested next step

Start **Phase 0**: scaffold the monorepo, migrations for the schema in §3, seed an admin + sample plans,
and a working `/health` endpoint — so every later phase has a runnable base.
