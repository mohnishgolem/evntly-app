-- Pre-migration schema backup, production project pzeosxtdulveuywhmkfe, read 14 Nov 2026 before
-- applying 20261113090000_founding_campaign_tags and 20261116090000_funnel_exclude_admin_activity.
-- Read with information_schema / pg_get_functiondef; no row data.
-- Row counts at backup: 6 beta_applications, 17 funnel_events, 880 page_views.
-- admin_founding_campaigns did not exist. Grants on both functions: authenticated, postgres, service_role.

-- public.beta_applications columns (no campaign column):
--   id uuid not null default gen_random_uuid(), user_id uuid not null, provider_id text, invitation_id uuid,
--   status text not null default 'started', source text not null default 'direct', admin_note text,
--   submitted_at timestamptz, decided_at timestamptz, decided_by uuid, created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now(), referral_code text, referred_by uuid, spotlight_posted_at timestamptz
-- public.funnel_events columns (no campaign column):
--   id bigint not null default nextval('funnel_events_id_seq'), created_at timestamptz not null default now(),
--   event text not null, source text, detail text, visitor_id text
-- public.page_views columns: id bigint not null, created_at timestamptz not null default now(), kind text not null,
--   visitor_id text not null, vendor_id text, user_id uuid, source text
-- Constraints on funnel_events: event_check (claim_click, signup_view, signup_attempt, signup_error, account_created,
--   email_confirmed), source_check (8 founding sources), detail_check ^[a-z0-9_]{1,40}$, visitor_id_check 8-64 chars.

-- Live function bodies (verified identical to these repo definitions on 14 Nov):
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
  views as (
    select * from public.page_views v, since
    where v.created_at >= since.t and (v.user_id is null or v.user_id not in (select id from admins))
  ),
  events as (select e.* from public.funnel_events e, since where e.created_at >= since.t)
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
  select e.event, coalesce(e.source, 'direct'), e.detail, count(*)
  from public.funnel_events e
  where e.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))
    and public.is_admin()
  group by 1, 2, 3
  order by 1, 2, 3;
$$;
revoke execute on function public.admin_founding_events(integer) from public, anon;
grant execute on function public.admin_founding_events(integer) to authenticated;
