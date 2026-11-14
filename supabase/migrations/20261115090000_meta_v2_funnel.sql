-- Meta Ads V2 funnel fixes (Nov 2026).
--
-- 1. page_views.source: founding page views record which founding link
--    brought the visitor (same cookie and values as funnel_events.source), so
--    paid Meta visits can be told apart from organic Instagram and DMs. The
--    first Meta test logged ~113 founding visitors against Meta's 48 landing
--    page views and there was no way to split them.
-- 2. funnel_events: two more steps.
--      signup_view      the vendor sign-up form opened (from a founding link)
--      email_confirmed  a vendor confirmed their email (detail: code | link)
--    The sign-up form now accepts the 6-digit code from the confirmation
--    email, so a vendor who signed up inside Instagram's browser stays signed
--    in there; these steps show whether that works.
-- 3. vendor_waitlist.wants_help / instagram: the "Prefer some help?" form on
--    /founding-vendors. Same consent rules as the waitlist (invite_consent,
--    consent_note, consent_at are set by the form).
-- 4. admin_funnel: steps 115 (sign-up form opened) and 116 (email confirmed).
--
-- Nothing personal is added: source is a fixed list, instagram is the
-- business handle or website the vendor typed themselves.

-- 1 ---------------------------------------------------------------------------
alter table public.page_views add column if not exists source text;
alter table public.page_views drop constraint if exists page_views_source_check;
alter table public.page_views add constraint page_views_source_check
  check (source is null or source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'meta_ads', 'referral', 'direct'));

-- 2 ---------------------------------------------------------------------------
alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check
  check (event in ('claim_click', 'signup_view', 'signup_attempt', 'signup_error', 'account_created', 'email_confirmed'));

-- 3 ---------------------------------------------------------------------------
alter table public.vendor_waitlist add column if not exists wants_help boolean not null default false;
alter table public.vendor_waitlist add column if not exists instagram text;
alter table public.vendor_waitlist drop constraint if exists vendor_waitlist_instagram_check;
alter table public.vendor_waitlist add constraint vendor_waitlist_instagram_check
  check (instagram is null or char_length(instagram) <= 120);

-- 4 ---------------------------------------------------------------------------
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
