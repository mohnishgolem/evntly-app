-- Evntly: the ONE definition of a genuine, verified vendor.
-- Read-only. Run with Supabase execute_sql (project pzeosxtdulveuywhmkfe).
-- Every acquisition number (dashboard, daily report, Meta ROI) must come from
-- this CTE or from public.admin_verified_vendor_funnel(), which mirrors it.
--
-- A row is one vendor ACCOUNT (public.users joined to auth.users, so orphan
-- profiles without an auth user are not counted).
--
-- Test / internal accounts are excluded when ANY of these is true:
--   * users.role = 'admin'
--   * service_providers.is_demo
--   * email domain evntlyapp.com (team + QA inboxes)
--   * beta_applications.campaign starts with 'qa'
--   * listing name contains the word QA or TEST
-- If a new test account slips through, add a rule here AND in the migration
-- 20261120090000_admin_verified_vendor_funnel.sql, then rerun the tests.
--
-- Stages (each implies the previous):
--   account            vendor account exists
--   verified           email confirmed (auth.users.email_confirmed_at)
--   listing_created    a service_providers row they own
--   approved           listing status 'approved'
--   completed          approved + >= 3 portfolio items + >= 1 active package
--                      (same rule as src/lib/listing-completion.ts)

with vendors as (
  select
    u.id                                   as user_id,
    lower(u.email)                         as email,
    u.created_at                           as registered_at,
    au.email_confirmed_at                  as verified_at,
    sp.id                                  as provider_id,
    sp.name                                as listing_name,
    sp.service_type                        as category,
    sp.status                              as listing_status,
    sp.social_link                         as social_link,
    ba.status                              as application_status,
    coalesce(ba.source, 'unattributed')    as source,
    ba.campaign                            as campaign,
    ba.decided_at                          as approved_at,
    (select count(*) from public.portfolio_items pi where pi.provider_id = sp.id)                as photos,
    (select count(*) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active) as packages,
    (
      u.role = 'admin'
      or coalesce(sp.is_demo, false)
      or split_part(lower(u.email), '@', 2) = 'evntlyapp.com'
      or coalesce(ba.campaign, '') ilike 'qa%'
      or coalesce(sp.name, '') ~* '(^|[^a-z])(qa|test)([^a-z]|$)'
    )                                      as is_test
  from public.users u
  join auth.users au on au.id::text = u.id::text
  left join public.service_providers sp on sp.owner_user_id::text = u.id::text
  left join public.beta_applications ba on ba.user_id::text = u.id::text
  where u.role = 'vendor' or sp.id is not null or ba.id is not null
),
genuine as (
  -- one row per email, in case someone made two accounts
  select distinct on (email) *,
    (verified_at is not null)                                            as is_verified,
    (listing_status = 'approved')                                        as is_approved,
    (listing_status = 'approved' and photos >= 3 and packages >= 1)      as is_completed
  from vendors
  where not is_test
  order by email, (listing_status = 'approved') desc, registered_at
)
-- Default output: the funnel. Swap the final SELECT for `select * from genuine`
-- to list vendors (contains emails: never paste into chat, artifacts or Slack).
select
  count(*)                                         as accounts,
  count(*) filter (where is_verified)              as verified_registrations,
  count(*) filter (where provider_id is not null)  as listings_created,
  count(*) filter (where is_approved)              as approved_listings,
  count(*) filter (where is_completed)             as completed_listings,
  (select count(*) from vendors where is_test)     as test_accounts_excluded
from genuine;
