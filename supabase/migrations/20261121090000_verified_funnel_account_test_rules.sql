-- Verified vendor funnel: also treat test ACCOUNTS (not just test listings)
-- as test. 19 Nov 2026: three internal logins with no listing were counted as
-- genuine vendors (a +qa-vendor Gmail alias, an account named "krishiv test",
-- and "saim", the QA vendor login), so "accounts" read 17 instead of 14.
--
-- Adds three rules to admin_verified_vendor_funnel(), same as
-- .claude/skills/evntly-acquisition-truth/sql/verified_vendors.sql and
-- src/lib/acquisition/test-accounts.ts:
--   * email alias with +qa or +test
--   * account name (auth user metadata full_name/name) with the word QA or TEST
--   * a known internal test account id
-- Same signature, grants and admin + MFA guard. No data changes.
-- Rollback: supabase/rollbacks/20261121090000_verified_funnel_account_test_rules.down.sql
-- (restores the 20261120090000 definition).

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
        or split_part(lower(u.email), '@', 1) ~ '\+(qa|test)'
        or coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '') ~* '(^|[^a-z])(qa|test)([^a-z]|$)'
        or u.id::text in ('75ff584a-0dc5-41cc-b69e-566f4bd731fa') -- "saim", internal test vendor
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
