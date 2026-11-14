-- Rollback for 20261113090000_founding_campaign_tags.sql
drop function if exists public.admin_founding_campaigns(integer);
alter table public.funnel_events drop constraint if exists funnel_events_campaign_check;
alter table public.funnel_events drop column if exists campaign;
alter table public.beta_applications drop constraint if exists beta_applications_campaign_check;
alter table public.beta_applications drop column if exists campaign;
