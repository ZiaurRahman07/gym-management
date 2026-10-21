import bcrypt from 'bcryptjs';
import { execute, query, queryOne, txExecute, withTransaction, type Conn } from './pool';
import { addDays, round2, toDateStr, todayStr } from '../lib/helpers';
import { runExpiryJob } from '../jobs/expiry';

/** Deterministic PRNG so demo data is stable between rebuilds. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20261020);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
const pad = (n: number) => String(n).padStart(2, '0');

function sqlDateTime(date: Date): string {
  return `${toDateStr(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

type PlanRow = { id: number; name: string; durationDays: number; price: number };

const FIRST_NAMES = [
  'Aisha', 'Daniel', 'Mia', 'Liam', 'Sofia', 'Noah', 'Emma', 'Omar', 'Chloe', 'Ethan', 'Zara', 'Lucas',
  'Grace', 'Hasan', 'Isabella', 'Leo', 'Nadia', 'Mason', 'Amara', 'Oliver', 'Fatima', 'Ryan', 'Ana', 'Kai',
];
const LAST_NAMES = [
  'Rahman', 'Cole', 'Thompson', 'Patel', 'Rossi', 'Kim', 'Walker', 'Hossain', 'Bennett', 'Brooks', 'Ali',
  'Meyer', 'Liu', 'Mahmud', 'Cruz', 'Fischer', 'Karim', 'Reed', 'Okafor', 'Grant', 'Noor', 'Walsh', 'Souza', 'Tanaka',
];

async function ensureUsers() {
  const accounts = [
    { name: 'Alex Morgan', email: 'admin@gym.local', password: 'Admin@12345', role: 'admin' },
    { name: 'Sara Chen', email: 'frontdesk@gym.local', password: 'Frontdesk@123', role: 'receptionist' },
    { name: 'Marcus Reed', email: 'trainer@gym.local', password: 'Trainer@123', role: 'trainer' },
  ];

  for (const account of accounts) {
    const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = ?', [account.email]);
    if (existing) continue;
    const hash = await bcrypt.hash(account.password, 10);
    await execute('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
      account.name,
      account.email,
      hash,
      account.role,
    ]);
    console.log(`  user ${account.email} / ${account.password}`);
  }
}

async function ensureSettings() {
  const defaults: Record<string, string> = {
    gym_name: 'Iron Pulse Fitness',
    currency_code: 'USD',
    currency_symbol: '$',
    timezone: 'UTC',
    alert_lead_days: '7',
    allow_expired_checkin: 'false',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await execute('INSERT IGNORE INTO settings (`key`, `value`) VALUES (?, ?)', [key, value]);
  }
}

async function ensurePlans(): Promise<PlanRow[]> {
  const catalog = [
    { name: 'Day Pass', durationDays: 1, price: 12, description: 'Single day access to the gym floor.' },
    { name: 'Monthly', durationDays: 30, price: 45, description: 'Full gym access for 30 days.' },
    { name: 'Quarterly', durationDays: 90, price: 120, description: 'Three months of full access â€” save 11%.' },
    { name: 'Half Year', durationDays: 180, price: 210, description: 'Six months of full access â€” save 22%.' },
    { name: 'Annual', durationDays: 365, price: 380, description: 'Best value â€” a full year of access.' },
  ];

  for (const plan of catalog) {
    const existing = await queryOne<{ id: number }>('SELECT id FROM plans WHERE name = ?', [plan.name]);
    if (!existing) {
      await execute('INSERT INTO plans (name, duration_days, price, description) VALUES (?, ?, ?, ?)', [
        plan.name,
        plan.durationDays,
        plan.price,
        plan.description,
      ]);
    }
  }

  return query<PlanRow>('SELECT id, name, duration_days AS durationDays, price FROM plans ORDER BY duration_days');
}

async function ensureTrainers() {
  const existing = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM trainers');
  if (Number(existing?.count) > 0) return;

  const trainerUser = await queryOne<{ id: number }>(`SELECT id FROM users WHERE email = 'trainer@gym.local'`);
  const catalog = [
    { name: 'Marcus Reed', specialization: 'Strength & Conditioning', phone: '+1-555-0101', email: 'marcus@gym.local', userId: trainerUser?.id ?? null },
    { name: 'Elena Vasquez', specialization: 'Yoga & Mobility', phone: '+1-555-0102', email: 'elena@gym.local', userId: null },
    { name: 'Jordan Blake', specialization: 'HIIT & Cardio', phone: '+1-555-0103', email: 'jordan@gym.local', userId: null },
    { name: 'Priya Nair', specialization: 'Nutrition & Weight Loss', phone: '+1-555-0104', email: 'priya@gym.local', userId: null },
  ];

  for (const trainer of catalog) {
    await execute(
      'INSERT INTO trainers (user_id, name, email, phone, specialization, hire_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [trainer.userId, trainer.name, trainer.email, trainer.phone, trainer.specialization, addDays(todayStr(), -400), 'active'],
    );
  }
  console.log(`  ${catalog.length} trainers`);
}

type SubResult = { id: number; end: string; status: string };

async function addSubscription(
  conn: Conn,
  memberId: number,
  plan: PlanRow,
  start: string,
  invoiceSeq: { value: number },
  adminId: number,
): Promise<SubResult> {
  const end = addDays(start, plan.durationDays - 1);
  const status = end < todayStr() ? 'expired' : 'active';
  const discount = random() < 0.18 ? pick([5, 10, 15]) : 0;
  const final = round2(Number(plan.price) - discount);
  const paidAt = `${start} 10:15:00`;
  const method = pick(['cash', 'card', 'card', 'bank', 'online']);

  const sub = await txExecute(
    conn,
    `INSERT INTO subscriptions
      (member_id, plan_id, start_date, end_date, status, price_at_purchase, discount, final_amount, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memberId, plan.id, start, end, status, plan.price, discount, final, adminId],
  );

  invoiceSeq.value += 1;
  await txExecute(
    conn,
    `INSERT INTO payments (invoice_no, member_id, subscription_id, amount, method, status, paid_at, notes, recorded_by)
     VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?)`,
    [
      `INV-SEED-${String(invoiceSeq.value).padStart(5, '0')}`,
      memberId,
      sub.insertId,
      final,
      method,
      paidAt,
      `${plan.name} membership`,
      adminId,
    ],
  );

  return { id: sub.insertId, end, status };
}

async function createDemoData() {
  const memberCount = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM members');
  if (Number(memberCount?.count) > 0) {
    console.log('Members already exist â€” skipping demo data.');
    return;
  }

  const plans = await ensurePlans();
  const byDuration = (days: number) => plans.find((plan) => plan.durationDays === days) ?? plans[1];
  const admin = await queryOne<{ id: number }>(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`);
  const trainerRows = await query<{ id: number }>('SELECT id FROM trainers ORDER BY id');
  const today = todayStr();
  const invoiceSeq = { value: 0 };

  await withTransaction(async (conn) => {
    const memberIds: number[] = [];
    const activeMemberIds: number[] = [];

    for (let i = 0; i < FIRST_NAMES.length; i += 1) {
      const firstName = FIRST_NAMES[i];
      const lastName = LAST_NAMES[i];
      const email = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com';
      const phone = `+1-555-${String(2000 + i * 7).padStart(4, '0')}`;
      // Keep a cluster of recent joins so the dashboard's "new this month" figure is meaningful.
      const joinDate =
        i >= 8 && i <= 13
          ? addDays(today, -(2 + (i - 8) * 2))
          : addDays(today, -(6 + Math.floor(random() * 300)));

      const member = await txExecute(
        conn,
        `INSERT INTO members
          (member_code, first_name, last_name, email, phone, gender, dob, address, emergency_contact, join_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          `TMP-${i}`,
          firstName,
          lastName,
          email,
          phone,
          pick(['male', 'female', 'other']),
          addDays(today, -(18 + Math.floor(random() * 30)) * 365),
          `${10 + i} ${pick(['Maple', 'Cedar', 'Oak', 'Pine'])} Street`,
          `+1-555-${String(9000 + i).padStart(4, '0')}`,
          joinDate,
          i % 9 === 0 ? 'Prefers morning sessions.' : null,
        ],
      );

      await txExecute(conn, 'UPDATE members SET member_code = ? WHERE id = ?', [
        `GYM-${String(member.insertId).padStart(4, '0')}`,
        member.insertId,
      ]);
      memberIds.push(member.insertId);

      // Two recent leads with no membership yet.
      if (i >= FIRST_NAMES.length - 2) continue;

      let plan = i % 5 === 0 ? byDuration(365) : i % 4 === 0 ? byDuration(180) : i % 3 === 0 ? byDuration(90) : byDuration(30);
      let start = joinDate;
      let sub = await addSubscription(conn, member.insertId, plan, start, invoiceSeq, admin?.id ?? 0);

      // Renew expired memberships so the roster shows realistic history.
      let renewals = 0;
      while (sub.end < today && renewals < 3) {
        plan = pick([byDuration(30), byDuration(30), byDuration(90), byDuration(180)]);
        start = addDays(sub.end, 1);
        sub = await addSubscription(conn, member.insertId, plan, start, invoiceSeq, admin?.id ?? 0);
        renewals += 1;
      }

      // A handful of memberships expire in the next week for the alerts demo.
      if (i === 1) await txExecute(conn, `UPDATE subscriptions SET end_date = ? WHERE id = ?`, [addDays(today, 1), sub.id]);
      if (i === 2) await txExecute(conn, `UPDATE subscriptions SET end_date = ? WHERE id = ?`, [addDays(today, 3), sub.id]);
      if (i === 3) await txExecute(conn, `UPDATE subscriptions SET end_date = ? WHERE id = ?`, [addDays(today, 7), sub.id]);
      if (i === 5) await txExecute(conn, `UPDATE subscriptions SET end_date = ? WHERE id = ?`, [addDays(today, 5), sub.id]);
      if (i === 8) await txExecute(conn, `UPDATE subscriptions SET end_date = ? WHERE id = ?`, [addDays(today, 2), sub.id]);

      if (sub.status === 'active') activeMemberIds.push(member.insertId);
    }

    // Attendance over the last 45 days for active members.
    for (const memberId of activeMemberIds) {
      const visits = Math.floor(random() * 13);
      for (let v = 0; v < visits; v += 1) {
        const daysAgo = 1 + Math.floor(random() * 44);
        const base = new Date();
        base.setDate(base.getDate() - daysAgo);
        base.setHours(6 + Math.floor(random() * 14), Math.floor(random() * 60), 0, 0);
        const checkout = new Date(base.getTime() + (45 + Math.floor(random() * 55)) * 60_000);
        await txExecute(
          conn,
          'INSERT INTO attendance (member_id, check_in_at, check_out_at, method) VALUES (?, ?, ?, ?)',
          [memberId, sqlDateTime(base), sqlDateTime(checkout), pick(['manual', 'manual', 'qr'])],
        );
      }
    }

    // Three members are currently in the gym.
    const inGym = activeMemberIds.slice(0, 3);
    const hours = [6, 7, 8];
    for (let i = 0; i < inGym.length; i += 1) {
      const base = new Date();
      base.setHours(hours[i], 10 + i * 11, 0, 0);
      await txExecute(conn, 'INSERT INTO attendance (member_id, check_in_at, method) VALUES (?, ?, ?)', [
        inGym[i],
        sqlDateTime(base),
        'manual',
      ]);
    }

    // Trainer assignments for the first active members.
    const assignable = activeMemberIds.slice(0, 12);
    for (let i = 0; i < assignable.length; i += 1) {
      const trainer = trainerRows[i % trainerRows.length];
      if (!trainer) break;
      await txExecute(
        conn,
        'INSERT INTO trainer_assignments (trainer_id, member_id, assigned_at) VALUES (?, ?, ?)',
        [trainer.id, assignable[i], addDays(today, -(10 + i))],
      );
    }

    console.log(`  ${memberIds.length} members, ${invoiceSeq.value} payments, attendance + assignments`);
  });
}

async function main() {
  console.log('Seeding database...');

  await ensureSettings();
  await ensureUsers();
  await ensurePlans();
  await ensureTrainers();
  await createDemoData();

  const alerts = await runExpiryJob();
  if (alerts.alertsCreated > 0) console.log(`  ${alerts.alertsCreated} expiry alerts generated`);

  console.log('\nDemo sign-in details');
  console.log('  Admin         admin@gym.local      / Admin@12345');
  console.log('  Receptionist  frontdesk@gym.local  / Frontdesk@123');
  console.log('  Trainer       trainer@gym.local    / Trainer@123');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import('./pool');
    await pool.end();
  });
