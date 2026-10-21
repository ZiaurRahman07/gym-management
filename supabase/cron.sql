-- ============================================================================
-- Optional: schedule the nightly expiry sweep with pg_cron.
--
-- 1. Supabase Dashboard -> Database -> Extensions -> enable "pg_cron".
-- 2. Run this file in the SQL Editor.
--
-- pg_cron uses UTC. '5 0 * * *' = 00:05 UTC every day.
-- For a gym in, say, Asia/Dhaka (UTC+6), use '5 18 * * *' to run at 00:05 local.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;

-- Drop a previous schedule with the same name, if any.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'gym-expiry-job') then
    perform cron.unschedule('gym-expiry-job');
  end if;
end $$;

select cron.schedule(
  'gym-expiry-job',
  '5 0 * * *',
  $$select public.run_expiry_job();$$
);

-- Inspect recent runs:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--
-- Run it once now:
--   select public.run_expiry_job();
