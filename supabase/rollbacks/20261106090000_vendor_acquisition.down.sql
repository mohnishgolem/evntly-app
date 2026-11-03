-- Rollback for 20261106090000_vendor_acquisition.sql. Drops the prospect
-- pipeline (and its data) and the daily report job.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'acquisition-report';
  end if;
end $$;

drop function if exists public.admin_set_prospect_consent(uuid, text, text);
drop function if exists public.admin_prospect_action(uuid, text, text);
drop function if exists public.admin_import_prospects(jsonb, boolean);
drop table if exists public.vendor_prospect_events;
drop table if exists public.vendor_prospects;
