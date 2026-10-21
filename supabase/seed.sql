-- ============================================================================
-- Iron Pulse - Gym Management
-- Supabase / PostgreSQL demo seed
--
-- Run AFTER supabase/schema.sql, on an empty project.
-- Demo sign-in details:
--   admin@gym.local      / Admin@12345
--   frontdesk@gym.local  / Frontdesk@123
--   trainer@gym.local    / Trainer@123
--
-- Change these passwords before going live.
-- ============================================================================

do $$
begin
  if (select count(*) from public.members) > 0 then
    raise exception 'Demo seed skipped: public.members already has rows.';
  end if;
end $$;

-- ---------------------------------------------------------------- staff

insert into public.users (id, name, email, password_hash, role, is_active) values
  (1, 'Alex Morgan', 'admin@gym.local',
   '$2b$10$cJlvBbgnfgSPeg.QHZqVM.pKIU/BHDl6UTyaSYXHnnCqLpP3bGKAC', 'admin', true),
  (2, 'Sara Chen', 'frontdesk@gym.local',
   '$2b$10$rh1eMbczGULQwMrSfZZ/TuHY0qxWnQLrOVZNl1PRGLuQQhPELWjNW', 'receptionist', true),
  (3, 'Marcus Reed', 'trainer@gym.local',
   '$2b$10$57C/uoSwVUoFMMNscli84.mRwiqJnoIfuSn7Fm2J4u.QLYySc7GIW', 'trainer', true);

-- ---------------------------------------------------------------- settings

insert into public.settings (key, value) values
  ('gym_name', 'Iron Pulse Fitness'),
  ('currency_code', 'USD'),
  ('currency_symbol', '$'),
  ('timezone', 'UTC'),
  ('alert_lead_days', '7'),
  ('allow_expired_checkin', 'false')
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------- plans

insert into public.plans (id, name, duration_days, price, description, is_active) values
  (1, 'Day Pass',   1,   12.00, 'Single day access to the gym floor.', true),
  (2, 'Monthly',    30,  45.00, 'Full gym access for 30 days.', true),
  (3, 'Quarterly',  90,  120.00, 'Three months of full access, save 11%.', true),
  (4, 'Half Year',  180, 210.00, 'Six months of full access, save 22%.', true),
  (5, 'Annual',     365, 380.00, 'Best value: a full year of access.', true);

-- ---------------------------------------------------------------- trainers

insert into public.trainers (id, user_id, name, email, phone, specialization, hire_date, status) values
  (1, 3, 'Marcus Reed',    'marcus@gym.local', '+1-555-0101', 'Strength & Conditioning', current_date - 400, 'active'),
  (2, null, 'Elena Vasquez', 'elena@gym.local',  '+1-555-0102', 'Yoga & Mobility',         current_date - 380, 'active'),
  (3, null, 'Jordan Blake',  'jordan@gym.local', '+1-555-0103', 'HIIT & Cardio',           current_date - 300, 'active'),
  (4, null, 'Priya Nair',    'priya@gym.local',  '+1-555-0104', 'Nutrition & Weight Loss', current_date - 240, 'active');

-- ---------------------------------------------------------------- members
-- Member 9 has an expired membership, member 10 is a lead with no plan.

insert into public.members
  (id, member_code, first_name, last_name, email, phone, gender, dob, address, emergency_contact, join_date, status, notes) values
  (1,  'GYM-0001', 'Aisha',  'Rahman',  'aisha.rahman@example.com',  '+1-555-2000', 'female', date '1996-04-12', '10 Maple Street',  '+1-555-9000', current_date - 280, 'active', 'Prefers morning sessions.'),
  (2,  'GYM-0002', 'Daniel', 'Cole',    'daniel.cole@example.com',   '+1-555-2007', 'male',   date '1991-09-03', '11 Pine Street',   '+1-555-9001', current_date - 250, 'active', null),
  (3,  'GYM-0003', 'Mia',    'Thompson','mia.thompson@example.com',  '+1-555-2014', 'female', date '1999-01-27', '12 Cedar Street',  '+1-555-9002', current_date - 200, 'active', null),
  (4,  'GYM-0004', 'Liam',   'Patel',   'liam.patel@example.com',    '+1-555-2021', 'male',   date '1994-06-18', '13 Oak Street',    '+1-555-9003', current_date - 160, 'active', null),
  (5,  'GYM-0005', 'Sofia',  'Rossi',   'sofia.rossi@example.com',   '+1-555-2028', 'female', date '1997-11-09', '14 Birch Street',  '+1-555-9004', current_date - 120, 'active', null),
  (6,  'GYM-0006', 'Noah',   'Kim',     'noah.kim@example.com',      '+1-555-2035', 'male',   date '1990-02-21', '15 Elm Street',    '+1-555-9005', current_date - 90,  'active', null),
  (7,  'GYM-0007', 'Emma',   'Walker',  'emma.walker@example.com',   '+1-555-2042', 'female', date '2000-07-30', '16 Aspen Street',  '+1-555-9006', current_date - 60,  'active', 'Student discount applied.'),
  (8,  'GYM-0008', 'Omar',   'Hossain', 'omar.hossain@example.com',  '+1-555-2049', 'male',   date '1993-12-05', '17 Willow Street', '+1-555-9007', current_date - 30,  'active', null),
  (9,  'GYM-0009', 'Chloe',  'Bennett', 'chloe.bennett@example.com', '+1-555-2056', 'female', date '1995-03-14', '18 Poplar Street', '+1-555-9008', current_date - 20,  'active', 'Needs a renewal.'),
  (10, 'GYM-0010', 'Ethan',  'Brooks',  'ethan.brooks@example.com',  '+1-555-2063', 'male',   date '1998-08-08', '19 Magnolia Street','+1-555-9009', current_date - 2,   'active', 'Walk-in enquiry, no plan yet.');

-- ---------------------------------------------------------------- subscriptions
-- Ends in 1 / 3 / 5 / 7 days to exercise expiry alerts; 9 is already expired.

insert into public.subscriptions
  (id, member_id, plan_id, start_date, end_date, status, price_at_purchase, discount, final_amount, created_by) values
  (1, 1, 2, current_date - 29,  current_date + 1,   'active',   45.00,  0.00, 45.00,  1),
  (2, 2, 2, current_date - 27,  current_date + 3,   'active',   45.00,  0.00, 45.00,  1),
  (3, 3, 3, current_date - 85,  current_date + 5,   'active',   120.00, 5.00, 115.00, 1),
  (4, 4, 3, current_date - 83,  current_date + 7,   'active',   120.00, 0.00, 120.00, 1),
  (5, 5, 4, current_date - 120, current_date + 60,  'active',   210.00, 10.00, 200.00, 1),
  (6, 6, 5, current_date - 65,  current_date + 300, 'active',   380.00, 0.00, 380.00, 1),
  (7, 7, 3, current_date - 30,  current_date + 60,  'active',   120.00, 15.00, 105.00, 1),
  (8, 8, 2, current_date - 5,   current_date + 25,  'active',   45.00,  0.00, 45.00,  1),
  (9, 9, 2, current_date - 40,  current_date - 10,  'expired',  45.00,  0.00, 45.00,  1);

-- ---------------------------------------------------------------- payments

insert into public.payments
  (id, invoice_no, member_id, subscription_id, amount, method, status, paid_at, notes, recorded_by) values
  (1, 'INV-SEED-00001', 1, 1, 45.00,  'card', 'paid', (current_date - 29)::timestamptz + interval '10 hours 15 minutes', 'Monthly membership',    1),
  (2, 'INV-SEED-00002', 2, 2, 45.00,  'cash', 'paid', (current_date - 27)::timestamptz + interval '11 hours 5 minutes',  'Monthly membership',    1),
  (3, 'INV-SEED-00003', 3, 3, 115.00, 'card', 'paid', (current_date - 85)::timestamptz + interval '9 hours 40 minutes',  'Quarterly membership',  1),
  (4, 'INV-SEED-00004', 4, 4, 120.00, 'bank', 'paid', (current_date - 83)::timestamptz + interval '17 hours 20 minutes', 'Quarterly membership',  1),
  (5, 'INV-SEED-00005', 5, 5, 200.00, 'card', 'paid', (current_date - 120)::timestamptz + interval '18 hours 10 minutes','Half Year membership',  1),
  (6, 'INV-SEED-00006', 6, 6, 380.00, 'online','paid',(current_date - 65)::timestamptz + interval '12 hours 30 minutes', 'Annual membership',     1),
  (7, 'INV-SEED-00007', 7, 7, 105.00, 'cash', 'paid', (current_date - 30)::timestamptz + interval '15 hours 45 minutes', 'Quarterly membership',  1),
  (8, 'INV-SEED-00008', 8, 8, 45.00,  'card', 'paid', (current_date - 5)::timestamptz + interval '8 hours 5 minutes',    'Monthly membership',    1),
  (9, 'INV-SEED-00009', 9, 9, 45.00,  'cash', 'paid', (current_date - 40)::timestamptz + interval '10 hours 0 minutes',  'Monthly membership',    1);

-- ---------------------------------------------------------------- trainer assignments

insert into public.trainer_assignments (trainer_id, member_id, assigned_at) values
  (1, 1, current_date - 60),
  (1, 5, current_date - 45),
  (2, 2, current_date - 40),
  (2, 6, current_date - 30),
  (3, 3, current_date - 25),
  (3, 7, current_date - 20),
  (4, 4, current_date - 15),
  (4, 8, current_date - 10);

-- ---------------------------------------------------------------- attendance

insert into public.attendance (member_id, check_in_at, check_out_at, method, recorded_by) values
  (1, date_trunc('day', now()) - interval '6 days' + interval '7 hours',  date_trunc('day', now()) - interval '6 days' + interval '8 hours 20 minutes', 'manual', 1),
  (1, date_trunc('day', now()) - interval '3 days' + interval '18 hours', date_trunc('day', now()) - interval '3 days' + interval '19 hours 10 minutes','manual', 1),
  (2, date_trunc('day', now()) - interval '5 days' + interval '6 hours',  date_trunc('day', now()) - interval '5 days' + interval '7 hours 15 minutes', 'qr',     1),
  (2, date_trunc('day', now()) - interval '1 day'  + interval '12 hours', date_trunc('day', now()) - interval '1 day'  + interval '13 hours 5 minutes',  'manual', 1),
  (3, date_trunc('day', now()) - interval '4 days' + interval '9 hours',  date_trunc('day', now()) - interval '4 days' + interval '10 hours 30 minutes', 'manual', 2),
  (3, date_trunc('day', now()) - interval '2 days' + interval '17 hours', date_trunc('day', now()) - interval '2 days' + interval '18 hours 40 minutes', 'manual', 2),
  (4, date_trunc('day', now()) - interval '2 days' + interval '6 hours',  date_trunc('day', now()) - interval '2 days' + interval '7 hours',            'qr',     1),
  (5, date_trunc('day', now()) - interval '1 day'  + interval '7 hours',  date_trunc('day', now()) - interval '1 day'  + interval '8 hours 25 minutes',  'manual', 1),
  (6, date_trunc('day', now()) - interval '3 days' + interval '19 hours', date_trunc('day', now()) - interval '3 days' + interval '20 hours 10 minutes', 'manual', 1),
  (7, date_trunc('day', now()) - interval '1 day'  + interval '16 hours', date_trunc('day', now()) - interval '1 day'  + interval '17 hours 20 minutes', 'qr',     2);

-- Two members are currently in the gym.
insert into public.attendance (member_id, check_in_at, check_out_at, method, recorded_by) values
  (1, greatest(date_trunc('day', now()), now() - interval '45 minutes'), null, 'manual', 1),
  (3, greatest(date_trunc('day', now()), now() - interval '20 minutes'), null, 'manual', 1);

-- ---------------------------------------------------------------- sequences
-- Explicit IDs above; move each identity sequence past them.

select setval(pg_get_serial_sequence('public.users', 'id'),                (select coalesce(max(id), 1) from public.users));
select setval(pg_get_serial_sequence('public.members', 'id'),              (select coalesce(max(id), 1) from public.members));
select setval(pg_get_serial_sequence('public.plans', 'id'),                (select coalesce(max(id), 1) from public.plans));
select setval(pg_get_serial_sequence('public.subscriptions', 'id'),        (select coalesce(max(id), 1) from public.subscriptions));
select setval(pg_get_serial_sequence('public.payments', 'id'),             (select coalesce(max(id), 1) from public.payments));
select setval(pg_get_serial_sequence('public.trainers', 'id'),             (select coalesce(max(id), 1) from public.trainers));
select setval(pg_get_serial_sequence('public.trainer_assignments', 'id'),  (select coalesce(max(id), 1) from public.trainer_assignments));
select setval(pg_get_serial_sequence('public.attendance', 'id'),           (select coalesce(max(id), 1) from public.attendance));

-- ---------------------------------------------------------------- alerts

do $$
begin
  perform public.run_expiry_job();
end $$;

select
  (select count(*) from public.members)       as members,
  (select count(*) from public.subscriptions) as subscriptions,
  (select count(*) from public.payments)      as payments,
  (select count(*) from public.attendance)    as attendance,
  (select count(*) from public.notifications) as alerts;
