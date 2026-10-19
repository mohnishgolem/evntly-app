-- Signup-to-booking funnel, self-hosted. The browser reports a handful of
-- page views (home, explore, vendor profile, plan, vendor signup, bundles)
-- with a random per-browser id — no cookies, no personal data, and nothing
-- sent when Do Not Track / Global Privacy Control is on. The later funnel
-- steps come straight from existing tables (signups, quotes, bookings).
-- Written by the service role only; admins read admin_funnel().

create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('home', 'explore', 'vendor', 'plan', 'vendor_signup', 'bundles')),
  visitor_id text not null check (char_length(visitor_id) between 8 and 64),
  vendor_id text,
  user_id uuid
);

create index if not exists page_views_created_idx on public.page_views (created_at desc);
create index if not exists page_views_kind_created_idx on public.page_views (kind, created_at desc);

alter table public.page_views enable row level security;
revoke all on public.page_views from anon, authenticated;

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
    select 101, 'Vendor signup page visitors', count(distinct visitor_id) from views where kind = 'vendor_signup'
    union all
    select 102, 'Vendors applied', count(*) from public.service_providers sp, since
      where sp.created_at >= since.t and not sp.is_demo
    union all
    select 103, 'Vendors approved', count(*) from public.service_providers sp, since
      where sp.created_at >= since.t and not sp.is_demo and sp.status = 'approved'
  ) f(step, label, people)
  where public.is_admin()
  order by step;
$$;

revoke execute on function public.admin_funnel(integer) from public, anon;
grant execute on function public.admin_funnel(integer) to authenticated;

select cron.schedule(
  'prune-page-views',
  '29 3 * * *',
  $$delete from public.page_views where created_at < now() - interval '400 days'$$
);
