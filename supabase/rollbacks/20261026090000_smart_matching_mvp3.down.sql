-- Undo 20261026090000_smart_matching_mvp3.sql. Match history and response
-- timestamps are lost; vendors' acceptance_rate / avg_response_hours keep
-- their last computed values (set them to null to return to neutral).

drop function if exists public.admin_matching_report(integer);
drop function if exists public.admin_set_matching_settings(boolean, jsonb);
drop table if exists public.match_runs;

select cron.unschedule('refresh-vendor-reliability') where exists (select 1 from cron.job where jobname = 'refresh-vendor-reliability');
drop function if exists public.refresh_vendor_reliability();

drop trigger if exists trg_quote_requests_responded_at on public.quote_requests;
drop function if exists public.stamp_quote_responded_at();
alter table public.quote_requests drop column if exists responded_at;
