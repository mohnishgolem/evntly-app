-- Per-post attribution for Founding Vendor sign-ups.
--
-- `source` says which channel a vendor came from (instagram_bio, instagram_dm,
-- ...), but every Instagram post shares the one bio link, so a Reel that
-- brings ten vendors can't be told apart from one that brings none. Links now
-- carry a campaign tag in utm_content (reel-a-1117, link_in_bio, dm-batch3),
-- remembered in a cookie like the source, and stored here:
--   beta_applications.campaign  set once, when the application is created
--   funnel_events.campaign      on every funnel event
-- Same privacy rules as `source`: a short public tag, nothing personal.

alter table public.beta_applications add column if not exists campaign text;
alter table public.beta_applications drop constraint if exists beta_applications_campaign_check;
alter table public.beta_applications add constraint beta_applications_campaign_check
  check (campaign is null or campaign ~ '^[a-z0-9][a-z0-9_-]{0,39}$');

alter table public.funnel_events add column if not exists campaign text;
alter table public.funnel_events drop constraint if exists funnel_events_campaign_check;
alter table public.funnel_events add constraint funnel_events_campaign_check
  check (campaign is null or campaign ~ '^[a-z0-9][a-z0-9_-]{0,39}$');

-- Founding funnel per campaign tag, for the admin dashboard and the weekly report.
create or replace function public.admin_founding_campaigns(p_days integer default 30)
returns table (campaign text, source text, claim_clicks bigint, accounts bigint, claimed bigint, submitted bigint, approved bigint)
language sql
stable
security definer
set search_path to ''
as $$
  with since as (select now() - make_interval(days => least(greatest(p_days, 1), 365)) as t),
  ev as (
    select coalesce(e.campaign, '(none)') as campaign, coalesce(e.source, 'direct') as source,
           count(distinct e.visitor_id) filter (where e.event = 'claim_click') as claim_clicks,
           count(*) filter (where e.event = 'account_created') as accounts
    from public.funnel_events e, since
    where e.created_at >= since.t
    group by 1, 2
  ),
  apps as (
    select coalesce(a.campaign, '(none)') as campaign, a.source,
           count(*) as claimed,
           count(*) filter (where a.submitted_at is not null) as submitted,
           count(*) filter (where a.status = 'approved') as approved
    from public.beta_applications a, since
    where a.created_at >= since.t
    group by 1, 2
  )
  select coalesce(ev.campaign, apps.campaign), coalesce(ev.source, apps.source),
         coalesce(ev.claim_clicks, 0), coalesce(ev.accounts, 0),
         coalesce(apps.claimed, 0), coalesce(apps.submitted, 0), coalesce(apps.approved, 0)
  from ev full join apps on apps.campaign = ev.campaign and apps.source = ev.source
  where public.is_admin()
  order by 7 desc, 5 desc, 3 desc;
$$;
revoke execute on function public.admin_founding_campaigns(integer) from public, anon;
grant execute on function public.admin_founding_campaigns(integer) to authenticated;
