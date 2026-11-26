-- Full vendor acquisition funnel, by category, channel and message variant.
-- Read-only. No emails, phones or names in the output.
--
-- Stages:
--   1 discovered   every prospect row
--   2 qualified    moved past 'discovered' (verified / eligible / approved / contacted / interested)
--   3 contacted    contacted_at set (a confirmed send)
--   4 replied      replied_at set, or stage 'interested'
--   5 interested   stage 'interested'
--   6 registered   matches a genuine vendor account by email or Instagram (name-only matches excluded)
--   7 verified     that account's email is confirmed
--   8 approved     that account's listing is approved
--   9 completed    approved + >= 3 photos + >= 1 active package
--  10 active       completed + signed in, answered a quote, or sent a message in the last 30 days
--
-- Rows: dimension = 'prospects_all' | 'category' | 'channel' | 'variant' (prospect funnel, stages 1-10)
--       dimension = 'accounts_all' | 'accounts_by_source' (every genuine vendor, stages 6-10 only,
--       including vendors who never came through outreach).
-- Channel: facebook_groups (notes 'FB groups…'), email or instagram_dm (from the contacted
--   event note, else the contact route on file), unknown.
-- Variant: the 'variant=<id>' tag in the 'contacted' event note (the convention from
--   26 Nov 2026; earlier sends show 'untagged').
-- Test-account rules match verified_vendors.sql: keep them in sync.

with accounts as (
  select distinct on (lower(u.email))
    lower(u.email) as email,
    lower(coalesce(sp.social_link, '')) as social,
    lower(btrim(sp.name)) as nm,
    coalesce(ba.source, 'unattributed') as source,
    au.email_confirmed_at is not null as is_verified,
    sp.status = 'approved' as is_approved,
    (sp.status = 'approved'
      and (select count(*) from public.portfolio_items pi where pi.provider_id = sp.id) >= 3
      and (select count(*) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active) >= 1) as is_completed,
    (au.last_sign_in_at > now() - interval '30 days'
      or exists (select 1 from public.quote_requests q where q.vendor_user_id::text = u.id::text and q.responded_at > now() - interval '30 days')
      or exists (select 1 from public.messages m where m.sender_user_id::text = u.id::text and m.created_at > now() - interval '30 days')
    ) as recently_active
  from public.users u
  join agent_read.auth_users au on au.id::text = u.id::text
  left join public.service_providers sp on sp.owner_user_id::text = u.id::text
  left join public.beta_applications ba on ba.user_id::text = u.id::text
  where (u.role = 'vendor' or sp.id is not null or ba.id is not null)
    and not (
      u.role = 'admin'
      or coalesce(sp.is_demo, false)
      or split_part(lower(u.email), '@', 2) = 'evntlyapp.com'
      or coalesce(ba.campaign, '') ilike 'qa%'
      or coalesce(sp.name, '') ~* '(^|[^a-z])(qa|test)([^a-z]|$)'
      or split_part(lower(u.email), '@', 1) ~ '\+(qa|test)'
      or coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '') ~* '(^|[^a-z])(qa|test)([^a-z]|$)'
      or u.id::text in ('75ff584a-0dc5-41cc-b69e-566f4bd731fa')
    )
  order by lower(u.email), (sp.status = 'approved') desc, u.created_at
),
contacted_ev as (
  select distinct on (prospect_id) prospect_id, note
  from public.vendor_prospect_events
  where action = 'contacted'
  order by prospect_id, created_at
),
p as (
  select vp.id,
    case
      when lower(vp.category) ~ 'photo|video|content' then 'photo_video'
      when lower(vp.category) ~ '(^|[^a-z])dj' then 'dj'
      when lower(vp.category) ~ 'decor|styl|balloon|hire' then 'decor'
      when lower(vp.category) ~ '(^|[^a-z])mc|ceremon|celebrant' then 'mc'
      when lower(vp.category) ~ 'flor' then 'florist'
      when lower(vp.category) ~ 'makeup|hair|beauty' then 'makeup'
      when lower(vp.category) ~ 'cake|dessert|cater' then 'cakes_catering'
      else 'other'
    end as category,
    case
      when coalesce(vp.notes, '') ilike 'FB groups%' then 'facebook_groups'
      when ce.note ~* 'e-?mail|gmail' then 'email'
      when ce.note ~* 'instagram|(^|[^a-z])ig([^a-z]|$)|dm' then 'instagram_dm'
      when vp.instagram is not null then 'instagram_dm'
      when vp.email is not null then 'email'
      else 'unknown'
    end as channel,
    coalesce(substring(ce.note from 'variant=([A-Za-z0-9_-]+)'), case when vp.contacted_at is not null then 'untagged' end) as variant,
    vp.stage <> 'discovered' or vp.contacted_at is not null as qualified,
    vp.contacted_at is not null as contacted,
    vp.replied_at is not null or vp.stage = 'interested' as replied,
    vp.stage = 'interested' as interested,
    a.email is not null as registered,
    coalesce(a.is_verified, false) as verified,
    coalesce(a.is_approved, false) as approved,
    coalesce(a.is_completed, false) as completed,
    coalesce(a.is_completed and a.recently_active, false) as active
  from public.vendor_prospects vp
  left join contacted_ev ce on ce.prospect_id = vp.id
  left join lateral (
    select * from accounts a
    where (vp.email_normalized is not null and a.email = vp.email_normalized)
       or (vp.instagram is not null and btrim(vp.instagram) <> ''
           and a.social like '%' || lower(trim(both '@' from vp.instagram)) || '%')
    limit 1
  ) a on true
),
prospect_rows as (
  select d.dimension, d.key,
    count(*) as discovered,
    count(*) filter (where qualified) as qualified,
    count(*) filter (where contacted) as contacted,
    count(*) filter (where replied) as replied,
    count(*) filter (where interested) as interested,
    count(*) filter (where registered) as registered,
    count(*) filter (where verified) as verified,
    count(*) filter (where approved) as approved,
    count(*) filter (where completed) as completed,
    count(*) filter (where active) as active
  from p
  cross join lateral (values ('prospects_all', 'all'), ('category', p.category),
                             ('channel', p.channel), ('variant', p.variant)) d(dimension, key)
  where d.key is not null
  group by 1, 2
),
account_rows as (
  select d.dimension, d.key,
    null::bigint, null::bigint, null::bigint, null::bigint, null::bigint,
    count(*),
    count(*) filter (where is_verified),
    count(*) filter (where is_approved),
    count(*) filter (where is_completed),
    count(*) filter (where is_completed and recently_active)
  from accounts
  cross join lateral (values ('accounts_all', 'all'), ('accounts_by_source', source)) d(dimension, key)
  group by 1, 2
)
select * from prospect_rows
union all
select * from account_rows
order by 1, 2;
