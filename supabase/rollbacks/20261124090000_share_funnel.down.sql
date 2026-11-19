-- Rollback for 20261124090000_share_funnel. Drops the report and the
-- share_funnel_events rows (attributed accounts and prepared shares).
drop function if exists public.admin_share_funnel_by_vendor(integer);
drop function if exists public.admin_share_funnel(integer);
drop table if exists public.share_funnel_events;
