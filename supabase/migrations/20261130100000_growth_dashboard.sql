-- Daily growth dashboard (Admin → Growth). NOT APPLIED; needs Sai's approval.
-- Depends on 20261130090000_vendor_listing_drafts (internal_test_user_ids,
-- vendor_listing_drafts).
--
-- 1. acquisition_spend: money actually spent on acquisition, entered by an
--    admin (Meta, printing, a coffee with a venue manager…). Nothing is
--    estimated: no entry, no cost. Admins with MFA only.
-- 2. admin_growth_daily(p_days): one row per Sydney day, from vendor
--    prospect to confirmed booking. Test/internal accounts excluded.
-- 3. admin_growth_totals(): the same measures as running totals now.
--
-- Definitions (all exclude test/internal accounts and demo listings):
--   vendor registration   vendor account with a confirmed email, by sign-up day
--   approved listing      founding application approved (decided_at), else
--                         listing creation day for listings approved before
--                         applications existed
--   completed listing     approved + 3 photos + 1 active package, dated when
--                         the last of those happened
--   customer registration customer account, by sign-up day
--   event plan            an event created by a real customer
--   genuine enquiry       a quote request from a real customer to a real,
--                         non-demo listing they don't own
--   confirmed booking     booking with status confirmed or completed, same rules
--
-- Rollback: supabase/rollbacks/20261130100000_growth_dashboard.down.sql

-- 1 ---------------------------------------------------------------------------
create table if not exists public.acquisition_spend (
  id bigserial primary key,
  day date not null,
  channel text not null check (channel in ('meta_ads', 'google_ads', 'instagram', 'events', 'print', 'partnerships', 'referral_rewards', 'tools', 'other')),
  audience text not null default 'vendor' check (audience in ('vendor', 'customer')),
  amount_cents integer not null check (amount_cents between 0 and 10000000),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists acquisition_spend_day_idx on public.acquisition_spend (day);
alter table public.acquisition_spend enable row level security;
revoke all on public.acquisition_spend from anon, authenticated;
grant select, insert, delete on public.acquisition_spend to authenticated;
grant usage on sequence public.acquisition_spend_id_seq to authenticated;

drop policy if exists acquisition_spend_admin on public.acquisition_spend;
create policy acquisition_spend_admin on public.acquisition_spend
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- 2 ---------------------------------------------------------------------------
create or replace function public.admin_growth_daily(p_days integer default 30)
returns table (
  day date,
  prospects_added integer,
  vendors_contacted integer,
  replies integer,
  listing_drafts integer,
  vendor_registrations integer,
  listings_approved integer,
  listings_completed integer,
  customer_registrations integer,
  event_plans integer,
  genuine_enquiries integer,
  confirmed_bookings integer,
  spend_cents bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with days as (
    select generate_series(
      (now() at time zone 'Australia/Sydney')::date - (least(greatest(p_days, 1), 365) - 1),
      (now() at time zone 'Australia/Sydney')::date,
      interval '1 day'
    )::date as day
  ),
  test_users as (select id from public.internal_test_user_ids() as t(id)),
  syd as (select 'Australia/Sydney'::text as tz),
  vendors as (
    select u.id::text as id, (u.created_at at time zone (select tz from syd))::date as reg_day
    from public.users u join auth.users au on au.id::text = u.id::text
    where u.role = 'vendor' and au.email_confirmed_at is not null and u.id::text not in (select id from test_users)
  ),
  listings as (
    select sp.id,
      (coalesce(
        (select max(ba.decided_at) from public.beta_applications ba where ba.user_id::text = sp.owner_user_id::text and ba.status = 'approved'),
        sp.created_at
      ) at time zone (select tz from syd))::date as approved_day,
      (select pi.created_at from public.portfolio_items pi where pi.provider_id = sp.id order by pi.created_at offset 2 limit 1) as third_photo_at,
      (select min(vp.created_at) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active) as first_package_at,
      coalesce(
        (select max(ba.decided_at) from public.beta_applications ba where ba.user_id::text = sp.owner_user_id::text and ba.status = 'approved'),
        sp.created_at
      ) as approved_at
    from public.service_providers sp
    where sp.status = 'approved' and not coalesce(sp.is_demo, false)
      and sp.owner_user_id is not null and sp.owner_user_id::text not in (select id from test_users)
  ),
  completed as (
    select (greatest(approved_at, third_photo_at, first_package_at) at time zone (select tz from syd))::date as day
    from listings where third_photo_at is not null and first_package_at is not null
  ),
  customers as (
    select (u.created_at at time zone (select tz from syd))::date as day
    from public.users u where u.role = 'customer' and u.id::text not in (select id from test_users)
  ),
  plans as (
    select (e.created_at at time zone (select tz from syd))::date as day
    from public.events e where e.organiser_user_id is not null and e.organiser_user_id::text not in (select id from test_users)
  ),
  enquiries as (
    select (q.created_at at time zone (select tz from syd))::date as day
    from public.quote_requests q join public.service_providers sp on sp.id = q.vendor_id
    where q.client_user_id is not null
      and q.client_user_id::text not in (select id from test_users)
      and q.client_user_id::text <> coalesce(sp.owner_user_id::text, '')
      and not coalesce(sp.is_demo, false)
      and coalesce(sp.owner_user_id::text, '') not in (select id from test_users)
  ),
  bookings as (
    select (b.created_at at time zone (select tz from syd))::date as day
    from public.bookings b join public.service_providers sp on sp.id::text = b.provider_id::text
    where b.status in ('confirmed', 'completed')
      and b.client_user_id is not null and b.client_user_id::text not in (select id from test_users)
      and not coalesce(sp.is_demo, false)
  )
  select
    d.day,
    (select count(*)::int from public.vendor_prospects p where (p.created_at at time zone (select tz from syd))::date = d.day),
    (select count(distinct e.prospect_id)::int from public.vendor_prospect_events e where e.action = 'contacted' and (e.created_at at time zone (select tz from syd))::date = d.day),
    (select count(distinct e.prospect_id)::int from public.vendor_prospect_events e where e.action = 'replied' and (e.created_at at time zone (select tz from syd))::date = d.day),
    (select count(*)::int from public.vendor_listing_drafts v where (v.created_at at time zone (select tz from syd))::date = d.day),
    (select count(*)::int from vendors v where v.reg_day = d.day),
    (select count(*)::int from listings l where l.approved_day = d.day),
    (select count(*)::int from completed c where c.day = d.day),
    (select count(*)::int from customers c where c.day = d.day),
    (select count(*)::int from plans p where p.day = d.day),
    (select count(*)::int from enquiries q where q.day = d.day),
    (select count(*)::int from bookings b where b.day = d.day),
    (select coalesce(sum(s.amount_cents), 0)::bigint from public.acquisition_spend s where s.day = d.day)
  from days d
  where public.is_admin()
  order by d.day desc;
$$;

revoke all on function public.admin_growth_daily(integer) from public, anon;
grant execute on function public.admin_growth_daily(integer) to authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.admin_growth_totals()
returns table (measure text, value bigint)
language sql
stable
security definer
set search_path to ''
as $$
  select m.measure, m.value from (
    select 'vendor_prospects'::text as measure, (select count(*) from public.vendor_prospects where not coalesce(do_not_contact, false)) as value
    union all select 'vendors_contacted', (select count(*) from public.vendor_prospects where contacted_at is not null)
    union all select 'replies', (select count(*) from public.vendor_prospects where replied_at is not null)
    union all select 'open_listing_drafts', (select count(*) from public.vendor_listing_drafts where claimed_at is null and revoked_at is null and expires_at > now())
    union all select 'acquisition_spend_cents', (select coalesce(sum(amount_cents), 0) from public.acquisition_spend)
  ) m
  where public.is_admin();
$$;

revoke all on function public.admin_growth_totals() from public, anon;
grant execute on function public.admin_growth_totals() to authenticated;
