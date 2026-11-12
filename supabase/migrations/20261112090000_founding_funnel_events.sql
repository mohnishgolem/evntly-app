-- Founding Vendor conversion events (privacy-safe, first-party).
--
-- The page-view funnel showed visitors reaching /founding-vendors but not
-- what happened after: a Meta-ads visitor was turned away by Supabase's
-- breached-password check on 10 Nov 2026 and that was only visible in the
-- auth logs. This records four steps, attributed to the founding source
-- (meta_ads, instagram_dm, waitlist_email, ...):
--   claim_click     visitor clicked a "Claim" button on /founding-vendors
--   signup_attempt  visitor submitted the vendor sign-up form
--   signup_error    Supabase rejected the sign-up (detail = error code only)
--   account_created a vendor account was created (email or Google)
-- Completed listings already live in beta_applications (submitted_at).
--
-- Nothing personal: no email, name, IP or user id. visitor_id is the same
-- random per-browser id page_views uses (and isn't sent at all under Do Not
-- Track / Global Privacy Control). Writes go through the service role only.

create table if not exists public.funnel_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('claim_click', 'signup_attempt', 'signup_error', 'account_created')),
  source text check (source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'meta_ads', 'referral', 'direct')),
  detail text check (detail is null or detail ~ '^[a-z0-9_]{1,40}$'),
  visitor_id text check (visitor_id is null or char_length(visitor_id) between 8 and 64)
);
create index if not exists funnel_events_event_created_idx on public.funnel_events (event, created_at desc);

alter table public.funnel_events enable row level security;
revoke all on table public.funnel_events from anon, authenticated;
revoke all on sequence public.funnel_events_id_seq from anon, authenticated;

-- Admins read it through admin_funnel / admin_founding_events only.
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
  ) f(step, label, people)
  where public.is_admin()
  order by step;
$$;

revoke execute on function public.admin_funnel(integer) from public, anon;
grant execute on function public.admin_funnel(integer) to authenticated;
