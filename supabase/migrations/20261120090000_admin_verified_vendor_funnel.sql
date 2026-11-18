-- Verified vendor funnel for Admin → Beta Vendors and the acquisition skills.
--
-- One row per (is_test, source). Read-only, admin-only (is_admin(): admin role
-- + MFA). It is the database twin of
-- .claude/skills/evntly-acquisition-truth/sql/verified_vendors.sql and of
-- src/lib/acquisition/test-accounts.ts: change all three together.
--
-- Counted per vendor ACCOUNT (public.users with an auth user, one per email):
--   accounts         vendor account exists
--   verified         email confirmed
--   listings_created owns a listing
--   approved         listing approved
--   completed        approved + >= 3 portfolio items + >= 1 active package
--
-- Test / internal (is_test = true, never shown as genuine): admin role, demo
-- listing, evntlyapp.com address, campaign starting 'qa', or a listing named
-- with the word QA or TEST.
--
-- Adds nothing else: no tables, no grants beyond execute, no data changes.
-- Rollback: supabase/rollbacks/20261120090000_admin_verified_vendor_funnel.down.sql

create or replace function public.admin_verified_vendor_funnel()
returns table (
  is_test boolean,
  source text,
  accounts integer,
  verified integer,
  listings_created integer,
  approved integer,
  completed integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with vendors as (
    select
      lower(u.email) as email,
      u.created_at,
      au.email_confirmed_at is not null as is_verified,
      sp.id as provider_id,
      sp.status as listing_status,
      coalesce(ba.source, 'unattributed') as source,
      (select count(*) from public.portfolio_items pi where pi.provider_id = sp.id) as photos,
      (select count(*) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active) as packages,
      (
        u.role = 'admin'
        or coalesce(sp.is_demo, false)
        or split_part(lower(u.email), '@', 2) = 'evntlyapp.com'
        or coalesce(ba.campaign, '') ilike 'qa%'
        or coalesce(sp.name, '') ~* '(^|[^a-z])(qa|test)([^a-z]|$)'
      ) as is_test
    from public.users u
    join auth.users au on au.id::text = u.id::text
    left join public.service_providers sp on sp.owner_user_id::text = u.id::text
    left join public.beta_applications ba on ba.user_id::text = u.id::text
    where public.is_admin()
      and (u.role = 'vendor' or sp.id is not null or ba.id is not null)
  ),
  one_per_email as (
    select distinct on (is_test, email) *
    from vendors
    order by is_test, email, (listing_status = 'approved') desc nulls last, created_at
  )
  select
    is_test,
    source,
    count(*)::integer,
    count(*) filter (where is_verified)::integer,
    count(*) filter (where provider_id is not null)::integer,
    count(*) filter (where listing_status = 'approved')::integer,
    count(*) filter (where listing_status = 'approved' and photos >= 3 and packages >= 1)::integer
  from one_per_email
  group by is_test, source
  order by is_test, count(*) desc;
$$;

revoke all on function public.admin_verified_vendor_funnel() from public, anon;
grant execute on function public.admin_verified_vendor_funnel() to authenticated;
