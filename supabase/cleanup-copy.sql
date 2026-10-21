-- ============================================================================
-- One-time copy cleanup (optional)
--
-- Removes typographic em dashes and en dashes from free-text columns and
-- replaces them with a plain hyphen. Run once against an existing database
-- that was seeded or used before this update. Safe to re-run.
--
-- chr(8212) is the em dash, chr(8211) is the en dash.
-- ============================================================================

update public.payments
   set notes = replace(replace(notes, chr(8212), '-'), chr(8211), '-')
 where notes like '%' || chr(8212) || '%' or notes like '%' || chr(8211) || '%';

update public.plans
   set description = replace(replace(description, chr(8212), '-'), chr(8211), '-')
 where description like '%' || chr(8212) || '%' or description like '%' || chr(8211) || '%';

update public.members
   set notes = replace(replace(notes, chr(8212), '-'), chr(8211), '-')
 where notes like '%' || chr(8212) || '%' or notes like '%' || chr(8211) || '%';

update public.subscriptions
   set notes = replace(replace(notes, chr(8212), '-'), chr(8211), '-')
 where notes like '%' || chr(8212) || '%' or notes like '%' || chr(8211) || '%';

update public.trainers
   set notes = replace(replace(notes, chr(8212), '-'), chr(8211), '-')
 where notes like '%' || chr(8212) || '%' or notes like '%' || chr(8211) || '%';

update public.notifications
   set body = replace(replace(body, chr(8212), '-'), chr(8211), '-')
 where body like '%' || chr(8212) || '%' or body like '%' || chr(8211) || '%';

select
  (select count(*) from public.payments where notes like '%' || chr(8212) || '%' or notes like '%' || chr(8211) || '%') as payment_notes_left,
  (select count(*) from public.plans where description like '%' || chr(8212) || '%' or description like '%' || chr(8211) || '%') as plan_descriptions_left;
