-- Verified registrations and completed listings per day and per source,
-- Sydney dates, last :days days (replace 30 below). Read-only.
-- Uses the same test-account rules as verified_vendors.sql: keep them in sync.
with vendors as (
  select distinct on (lower(u.email))
    lower(u.email) as email,
    (au.email_confirmed_at at time zone 'Australia/Sydney')::date as verified_day,
    coalesce(ba.source, 'unattributed') as source,
    coalesce(ba.campaign, '') as campaign,
    sp.status = 'approved' as is_approved,
    sp.status = 'approved'
      and (select count(*) from public.portfolio_items pi where pi.provider_id = sp.id) >= 3
      and (select count(*) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active) >= 1 as is_completed
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
    and au.email_confirmed_at is not null
  order by lower(u.email), (sp.status = 'approved') desc, u.created_at
)
select verified_day, source, campaign,
  count(*) as verified_registrations,
  count(*) filter (where is_approved) as approved,
  count(*) filter (where is_completed) as completed
from vendors
where verified_day >= (now() at time zone 'Australia/Sydney')::date - 30
group by 1, 2, 3
order by 1 desc, 4 desc;
