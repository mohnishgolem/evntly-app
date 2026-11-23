-- Which prospects became genuine vendor accounts? Read-only.
-- match = 'email' or 'instagram' is strong; 'name' is "possible" until a human checks.
with vendors as (
  select u.id::text as user_id, lower(u.email) as email, lower(btrim(sp.name)) as nm,
    lower(coalesce(sp.social_link, '')) as social, sp.status as listing_status,
    au.email_confirmed_at is not null as verified,
    (select count(*) from public.portfolio_items pi where pi.provider_id = sp.id) as photos,
    (select count(*) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active) as packages
  from public.users u
  join auth.users au on au.id::text = u.id::text
  left join public.service_providers sp on sp.owner_user_id::text = u.id::text
  where u.role = 'vendor'
    and split_part(lower(u.email), '@', 2) <> 'evntlyapp.com'
    and coalesce(sp.name, '') !~* '(^|[^a-z])(qa|test)([^a-z]|$)'
    and split_part(lower(u.email), '@', 1) !~ '\+(qa|test)'
    and coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '') !~* '(^|[^a-z])(qa|test)([^a-z]|$)'
    and u.id::text not in ('75ff584a-0dc5-41cc-b69e-566f4bd731fa') -- "saim", internal test vendor
)
select p.id as prospect_id, p.business_name, p.stage as prospect_stage, p.contacted_at is not null as was_contacted,
  case
    when p.email_normalized is not null and v.email = p.email_normalized then 'email'
    when p.instagram is not null and v.social like '%' || lower(trim(both '@' from p.instagram)) || '%' then 'instagram'
    else 'name'
  end as match,
  v.verified, v.listing_status, v.photos, v.packages,
  (v.listing_status = 'approved' and v.photos >= 3 and v.packages >= 1) as completed
from public.vendor_prospects p
join vendors v on (p.email_normalized is not null and v.email = p.email_normalized)
  or (p.instagram is not null and btrim(p.instagram) <> '' and v.social like '%' || lower(trim(both '@' from p.instagram)) || '%')
  or (v.nm is not null and v.nm = p.business_name_normalized)
order by completed desc, p.business_name;
