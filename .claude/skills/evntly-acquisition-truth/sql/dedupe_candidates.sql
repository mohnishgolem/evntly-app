-- Check research candidates BEFORE anyone sees them as leads. Read-only.
-- Paste candidates into the VALUES list (business name, email or null,
-- instagram handle without @ or null, website domain or null).
-- verdict = 'new' is the only row that may become a lead.
with c(business_name, email, instagram, domain) as (
  values
    ('Example Studio', null::text, 'examplestudio', 'examplestudio.com.au')
),
n as (
  select business_name,
    lower(btrim(business_name)) as nm,
    nullif(lower(btrim(email)), '') as em,
    nullif(lower(trim(both '@' from btrim(instagram))), '') as ig,
    nullif(lower(regexp_replace(btrim(domain), '^(https?://)?(www\.)?', '')), '') as dom
  from c
)
select n.business_name,
  case
    when exists (select 1 from public.vendor_prospects p
                 where p.business_name_normalized = n.nm
                    or (n.em is not null and p.email_normalized = n.em)
                    or (n.ig is not null and lower(trim(both '@' from p.instagram)) = n.ig)
                    or (n.dom is not null and lower(regexp_replace(coalesce(p.website, ''), '^(https?://)?(www\.)?', '')) like n.dom || '%'))
      then 'already_prospect'
    when n.em is not null and exists (select 1 from public.vendor_waitlist w where w.email_normalized = n.em) then 'on_waitlist'
    when n.em is not null and exists (select 1 from public.users u where lower(u.email) = n.em) then 'has_account'
    when n.dom is not null and exists (select 1 from public.users u where split_part(lower(u.email), '@', 2) = n.dom) then 'has_account_same_domain'
    when exists (select 1 from public.service_providers sp
                 where not coalesce(sp.is_demo, false)
                   and (lower(btrim(sp.name)) = n.nm
                        or (n.ig is not null and lower(coalesce(sp.social_link, '')) like '%' || n.ig || '%')))
      then 'has_listing'
    else 'new'
  end as verdict
from n;
