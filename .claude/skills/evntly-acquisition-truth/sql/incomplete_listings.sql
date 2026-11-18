-- Genuine vendors who registered but have not got a completed listing,
-- with what's missing. Read-only. Output contains vendor names but no emails;
-- keep it in Sai's local files / the private Acquisition Desk only.
with v as (
  select distinct on (lower(u.email))
    u.created_at as registered_at,
    au.email_confirmed_at,
    sp.id as provider_id, sp.name as listing_name, sp.service_type as category, sp.status as listing_status,
    sp.social_link, ba.status as application_status, coalesce(ba.source, 'unattributed') as source,
    (select count(*) from public.portfolio_items pi where pi.provider_id = sp.id) as photos,
    (select count(*) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active) as packages,
    exists (select 1 from public.listing_setup_requests r where r.provider_id = sp.id and r.status <> 'closed') as asked_for_setup_help
  from public.users u
  join auth.users au on au.id::text = u.id::text
  left join public.service_providers sp on sp.owner_user_id::text = u.id::text
  left join public.beta_applications ba on ba.user_id::text = u.id::text
  where (u.role = 'vendor' or sp.id is not null or ba.id is not null)
    and not (
      u.role = 'admin' or coalesce(sp.is_demo, false)
      or split_part(lower(u.email), '@', 2) = 'evntlyapp.com'
      or coalesce(ba.campaign, '') ilike 'qa%'
      or coalesce(sp.name, '') ~* '(^|[^a-z])(qa|test)([^a-z]|$)'
    )
  order by lower(u.email), (sp.status = 'approved') desc, u.created_at
)
select
  case
    when email_confirmed_at is null then '1_email_not_confirmed'
    when provider_id is null then '2_no_listing_started'
    when photos < 3 and packages < 1 then '3_needs_photos_and_package'
    when photos < 3 then '4_needs_photos'
    when packages < 1 then '5_needs_package'
    when listing_status in ('draft') then '6_ready_to_submit'
    when listing_status = 'pending_review' then '7_waiting_for_our_review'
    else '8_other'
  end as stuck_at,
  coalesce(listing_name, '(no listing yet)') as vendor, category, listing_status, application_status, source,
  photos, packages, asked_for_setup_help,
  (now()::date - registered_at::date) as days_since_signup
from v
where not coalesce(listing_status = 'approved' and photos >= 3 and packages >= 1, false)
order by stuck_at, registered_at;
