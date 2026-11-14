-- Leave our own activity out of the founding conversion reports.
--
-- page_views already skipped rows signed in as an admin, but an admin's
-- signed-out visits and every funnel event (claim taps, sign-up form views)
-- were counted: the 14 Nov Instagram test added admin claim taps to the Meta
-- funnel. A browser that has ever been used signed in as an admin (its random
-- visitor id appears on an admin page view) is now treated as ours in all
-- three reports, and founding applications made by admin accounts are left
-- out of the campaign report.
--
-- Reports only: no rows are changed or deleted. Depends on
-- 20261113090000_founding_campaign_tags.sql (campaign columns) and
-- 20261115090000_meta_v2_funnel.sql (steps 115-116).
-- Rollback: supabase/rollbacks/20261116090000_funnel_exclude_admin_activity.down.sql

create or replace function public.admin_funnel(p_days integer default 30)
returns table (step integer, label text, people bigint)
language sql
stable
security definer
set search_path to ''
as $$
  with since as (select now() - make_interval(days => least(greatest(p_days, 1), 365)) as t),
  -- Admins' own activity would skew a tiny funnel; leave it out.
  admins as (select u.id::uuid as id from public.users u where u.role = 'admin'),
  -- Browsers an admin has used while signed in: their signed-out visits and
  -- funnel events (claim taps, sign-up form views) are our own testing too.
  admin_browsers as (select distinct v.visitor_id from public.page_views v where v.visitor_id is not null and v.user_id in (select id from admins)),
  views as (
    select * from public.page_views v, since
    where v.created_at >= since.t and (v.user_id is null or v.user_id not in (select id from admins))
      and v.visitor_id not in (select visitor_id from admin_browsers)
  ),
  events as (
    select e.* from public.funnel_events e, since
    where e.created_at >= since.t and (e.visitor_id is null or e.visitor_id not in (select visitor_id from admin_browsers))
  )
  select * from (
    select 1, 'Visited Evntly', count(distinct visitor_id) from views
    union all
    select 2, 'Browsed vendors (Explore or a profile)', count(distinct visitor_id) from views where kind in ('explore', 'vendor')
    union all
    select 3, 'Opened a vendor profile', count(distinct visitor_id) from views where kind = 'vendor'
    union all
    select 4, 'Started planning an event', count(distinct visitor_id) from views where kind = 'plan'
    union all
    select 5, 'Signed up', count(*) from auth.users au, since
      where au.created_at >= since.t and au.id not in (select id from admins)
    union all
    select 6, 'Requested a quote', count(distinct q.client_user_id) from public.quote_requests q, since
      where q.created_at >= since.t and q.client_user_id not in (select id from admins)
    union all
    select 7, 'Got a quote back', count(distinct q.client_user_id) from public.quote_requests q, since
      where q.created_at >= since.t and q.quoted_amount is not null and q.client_user_id not in (select id from admins)
    union all
    select 8, 'Booked a vendor', count(distinct b.client_user_id) from public.bookings b, since
      where b.created_at >= since.t and b.status <> 'cancelled' and b.client_user_id not in (select id from admins)
    union all
    select 100, 'Founding Vendor page visitors', count(distinct visitor_id) from views where kind = 'founding'
    union all
    select 101, 'Opened vendor sign-up or claim page', count(distinct visitor_id) from views where kind in ('vendor_signup', 'founding_claim')
    union all
    select 102, 'Vendors applied', count(*) from public.service_providers sp, since
      where sp.created_at >= since.t and not sp.is_demo
    union all
    select 103, 'Vendors approved', count(*) from public.service_providers sp, since
      where sp.created_at >= since.t and not sp.is_demo and sp.status = 'approved'
    union all
    select 110, 'Clicked "Claim" on the founding page', count(distinct visitor_id) from events where event = 'claim_click'
    union all
    select 111, 'Tried to create a vendor account', count(distinct visitor_id) from events where event = 'signup_attempt'
    union all
    select 112, 'Vendor sign-up rejected (e.g. weak password)', count(*) from events where event = 'signup_error'
    union all
    select 113, 'Vendor accounts created', count(*) from events where event = 'account_created'
    union all
    select 114, 'Founding listings submitted', count(*) from public.beta_applications a, since
      where a.submitted_at >= since.t and a.provider_id is not null
    union all
    select 115, 'Opened the vendor sign-up form', count(distinct visitor_id) from events where event = 'signup_view'
    union all
    select 116, 'Vendor emails confirmed', count(*) from events where event = 'email_confirmed'
  ) f(step, label, people)
  where public.is_admin()
  order by step;
$$;

revoke execute on function public.admin_funnel(integer) from public, anon;
grant execute on function public.admin_funnel(integer) to authenticated;

create or replace function public.admin_founding_events(p_days integer default 30)
returns table (event text, source text, detail text, n bigint)
language sql
stable
security definer
set search_path to ''
as $$
  with admin_browsers as (
    select distinct v.visitor_id from public.page_views v
    where v.visitor_id is not null and v.user_id in (select u.id::uuid from public.users u where u.role = 'admin')
  )
  select e.event, coalesce(e.source, 'direct'), e.detail, count(*)
  from public.funnel_events e
  where e.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))
    and (e.visitor_id is null or e.visitor_id not in (select visitor_id from admin_browsers))
    and public.is_admin()
  group by 1, 2, 3
  order by 1, 2, 3;
$$;
revoke execute on function public.admin_founding_events(integer) from public, anon;
grant execute on function public.admin_founding_events(integer) to authenticated;

create or replace function public.admin_founding_campaigns(p_days integer default 30)
returns table (campaign text, source text, claim_clicks bigint, accounts bigint, claimed bigint, submitted bigint, approved bigint)
language sql
stable
security definer
set search_path to ''
as $$
  with since as (select now() - make_interval(days => least(greatest(p_days, 1), 365)) as t),
  admins as (select u.id::uuid as id from public.users u where u.role = 'admin'),
  admin_browsers as (select distinct v.visitor_id from public.page_views v where v.visitor_id is not null and v.user_id in (select id from admins)),
  ev as (
    select coalesce(e.campaign, '(none)') as campaign, coalesce(e.source, 'direct') as source,
           count(distinct e.visitor_id) filter (where e.event = 'claim_click') as claim_clicks,
           count(*) filter (where e.event = 'account_created') as accounts
    from public.funnel_events e, since
    where e.created_at >= since.t and (e.visitor_id is null or e.visitor_id not in (select visitor_id from admin_browsers))
    group by 1, 2
  ),
  apps as (
    select coalesce(a.campaign, '(none)') as campaign, a.source,
           count(*) as claimed,
           count(*) filter (where a.submitted_at is not null) as submitted,
           count(*) filter (where a.status = 'approved') as approved
    from public.beta_applications a, since
    where a.created_at >= since.t and (a.user_id is null or a.user_id::uuid not in (select id from admins))
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
