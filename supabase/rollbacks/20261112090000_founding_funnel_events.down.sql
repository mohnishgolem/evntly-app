-- Rollback for 20261112090000_founding_funnel_events.sql
drop function if exists public.admin_founding_events(integer);
drop table if exists public.funnel_events;
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
    select 100, 'Founding Vendor page visitors', count(distinct visitor_id) from views where kind = 'founding'
    union all
    select 101, 'Opened vendor sign-up or claim page', count(distinct visitor_id) from views where kind in ('vendor_signup', 'founding_claim')
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
