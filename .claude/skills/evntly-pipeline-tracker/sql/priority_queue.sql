-- Prioritised lead queue: prospects not yet contacted, not do-not-contact,
-- not already an Evntly vendor. Read-only.
-- Score mirrors src/lib/acquisition/lead-score.ts (keep the two in sync;
-- the unit tests pin the TypeScript side).
with p as (
  select vp.*,
    case
      when lower(category) ~ 'photo|video|content' then 'photo_video'
      when lower(category) ~ '(^|[^a-z])dj' then 'dj'
      when lower(category) ~ 'decor|styl|balloon|hire' then 'decor'
      when lower(category) ~ '(^|[^a-z])mc|ceremon|celebrant' then 'mc'
      when lower(category) ~ 'flor' then 'florist'
      when lower(category) ~ 'makeup|hair|beauty' then 'makeup'
      when lower(category) ~ 'cake|dessert|cater' then 'cakes_catering'
      else 'other'
    end as category_group
  from public.vendor_prospects vp
  where not vp.do_not_contact
    and vp.stage in ('discovered', 'verified', 'contact_eligible', 'outreach_approved')
    and vp.contacted_at is null
    and not exists (select 1 from public.users u where vp.email_normalized is not null and lower(u.email) = vp.email_normalized)
    and not exists (select 1 from public.service_providers sp where lower(btrim(sp.name)) = vp.business_name_normalized and not coalesce(sp.is_demo, false))
),
s as (
  select p.*,
    case lead_quality when 'A' then 30 when 'B' then 20 else 5 end
    + case category_group when 'photo_video' then 20 when 'dj' then 18 when 'decor' then 16 when 'mc' then 15
                          when 'florist' then 14 when 'makeup' then 12 when 'cakes_catering' then 8 else 5 end
    + case
        when email is not null and consent_basis <> 'none' then 20
        when instagram is not null then 15
        when phone is not null then 5
        else 0
      end
    + case when stage in ('verified', 'contact_eligible', 'outreach_approved') then 10 else 0 end as score,
    case
      when email is not null and consent_basis <> 'none' then 'email_draft'
      when instagram is not null then 'instagram_dm'
      when phone is not null then 'call_list'
      else 'needs_contact_route'
    end as next_channel
  from p
)
select id, business_name, category_group, suburb, lead_quality, stage, next_channel, score, source_url
from s
order by (next_channel = 'needs_contact_route'), score desc, created_at
limit 60;
