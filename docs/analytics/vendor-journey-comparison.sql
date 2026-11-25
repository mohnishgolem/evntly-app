-- Old (/founding-vendors → sign-up → 5-step form) vs new (/become-a-vendor →
-- builder → save) vendor journeys. READ-ONLY. Run with Supabase execute_sql.
--
-- Windows (Sydney time):
--   old  = 30 days before the new journey went live (25 Oct – 25 Nov 11:06)
--   new  = since 25 Nov 11:06
-- Each journey is also split by channel, because warm DMs convert far
-- better than ads or organic: compare like with like (warm vs warm).
--
-- Raw counts are always shown next to rates. Decision rule (set before any
-- results): don't call either journey better until EACH has at least 30
-- unique visitors from the SAME channel group, and the gap in visitor →
-- listing-saved is at least 2 listings. Below that, report "too early".
--
-- Excludes admins' browsers, bots (never recorded) and test/internal accounts.

with params as (
  select timestamptz '2026-11-25 11:06:00+11' as live_at,
         timestamptz '2026-11-25 11:06:00+11' - interval '30 days' as old_from
),
admin_browsers as (
  select distinct v.visitor_id from public.page_views v
  where v.visitor_id is not null and v.user_id::text in (select id::text from public.users where role = 'admin')
),
test_users as (select id from public.internal_test_user_ids() as t(id)),
chan as (
  select s, case when s in ('instagram_dm','direct_outreach','instagram_bio','instagram_story','waitlist_email','referral','direct') then 'warm'
                 when s = 'meta_ads' then 'ads' else 'unattributed' end as grp
  from (select unnest(array['instagram_dm','direct_outreach','instagram_bio','instagram_story','waitlist_email','referral','direct','meta_ads']) s) x
),
pv as (
  select v.visitor_id, v.created_at, v.kind,
    case when v.created_at >= (select live_at from params) and v.kind in ('vendor_landing','vendor_builder') then 'new'
         when v.created_at <  (select live_at from params) and v.created_at >= (select old_from from params) and v.kind = 'founding' then 'old' end as journey,
    coalesce((select grp from chan where chan.s = v.source), 'unattributed') as grp
  from public.page_views v
  where v.visitor_id is not null and v.visitor_id not in (select visitor_id from admin_browsers)
),
visitors as (select journey, grp, count(distinct visitor_id) n from pv where journey is not null group by 1, 2),
fe as (
  select f.event, f.visitor_id, f.created_at, f.detail, f.campaign,
    case when f.created_at >= (select live_at from params) then 'new'
         when f.created_at >= (select old_from from params) then 'old' end as journey,
    coalesce((select grp from chan where chan.s = f.source), 'unattributed') as grp
  from public.funnel_events f
  where f.visitor_id is null or f.visitor_id not in (select visitor_id from admin_browsers)
),
ev as (
  select journey, grp,
    count(distinct visitor_id) filter (where (journey = 'old' and event = 'claim_click') or (journey = 'new' and event = 'vendor_cta')) as cta_clicks,
    count(distinct visitor_id) filter (where (journey = 'old' and event = 'listing_started') or (journey = 'new' and event = 'builder_started')) as builder_starts,
    count(distinct visitor_id) filter (where journey = 'new' and event = 'builder_preview') as previews,
    count(*) filter (where event = 'account_created') as registrations,
    count(*) filter (where event = 'email_confirmed') as email_verified
  from fe where journey is not null group by 1, 2
),
-- New journey listings: drafts saved by a verified (non-test) account.
new_listings as (
  select coalesce((select grp from chan where chan.s = d.source), case when d.origin = 'assisted' then 'warm' else 'unattributed' end) grp,
         d.provider_id, d.claimed_at - d.created_at as took
  from public.vendor_listing_drafts d
  where d.provider_id is not null and d.claimed_at >= (select live_at from params)
    and d.claimed_by::text not in (select id from test_users)
),
-- Old journey listings: listings created in the old window by genuine vendors.
old_listings as (
  select coalesce((select grp from chan where chan.s = ba.source), 'unattributed') grp, sp.id provider_id, sp.created_at - u.created_at as took
  from public.service_providers sp
  join public.users u on u.id::text = sp.owner_user_id::text
  left join public.beta_applications ba on ba.user_id::text = u.id::text
  where sp.created_at >= (select old_from from params) and sp.created_at < (select live_at from params)
    and not coalesce(sp.is_demo, false) and sp.owner_user_id::text not in (select id from test_users)
),
listings as (
  select 'new' journey, * from new_listings union all select 'old', * from old_listings
),
lst as (
  select l.journey, l.grp, count(*) listings_saved,
    count(*) filter (where sp.status = 'approved'
                      and (select count(*) from public.portfolio_items pi where pi.provider_id = sp.id) >= 3
                      and exists (select 1 from public.vendor_packages vp where vp.provider_id = sp.id and vp.active)) completed,
    percentile_cont(0.5) within group (order by extract(epoch from l.took) / 60) as median_minutes_to_listing,
    count(distinct q.vendor_id) vendors_with_genuine_enquiry
  from listings l
  join public.service_providers sp on sp.id = l.provider_id
  left join public.quote_requests q on q.vendor_id = sp.id and q.client_user_id is not null
       and q.client_user_id::text not in (select id from test_users)
       and q.client_user_id::text <> coalesce(sp.owner_user_id::text, '')
  group by 1, 2
),
keys as (select distinct journey, grp from (select journey, grp from visitors union select journey, grp from ev union select journey, grp from lst) k)
select k.journey, k.grp as channel,
  coalesce(v.n, 0) visitors,
  coalesce(e.cta_clicks, 0) cta_clicks, round(100.0 * coalesce(e.cta_clicks, 0) / nullif(v.n, 0), 1) cta_pct,
  coalesce(e.builder_starts, 0) builder_starts, round(100.0 * coalesce(e.builder_starts, 0) / nullif(v.n, 0), 1) start_pct,
  coalesce(e.previews, 0) previews,
  coalesce(e.registrations, 0) registrations, coalesce(e.email_verified, 0) email_verified,
  coalesce(l.listings_saved, 0) listings_saved, round(100.0 * coalesce(l.listings_saved, 0) / nullif(v.n, 0), 1) listing_pct,
  coalesce(l.completed, 0) completed_listings,
  round(l.median_minutes_to_listing::numeric, 0) median_minutes_to_listing,
  coalesce(l.vendors_with_genuine_enquiry, 0) vendors_with_genuine_enquiry
from keys k
left join visitors v on v.journey = k.journey and v.grp = k.grp
left join ev e on e.journey = k.journey and e.grp = k.grp
left join lst l on l.journey = k.journey and l.grp = k.grp
order by k.journey desc, k.grp;
-- Notes on comparability:
--   * "builder starts": old = listing form opened AFTER an account existed;
--     new = first answer, BEFORE any account. Not the same moment; compare
--     visitor → listing saved as the headline instead.
--   * "median minutes to listing": old = account created → listing created;
--     new = draft started → saved as listing (includes sign-up + email code).
--   * registrations / email_verified come from funnel events, attributed by the
--     founding source cookie, so a visitor who switches device may show as
--     unattributed.
--   * Per-prospect experiment tags (utm_content = exp25_pNN) are in
--     funnel_events.campaign and vendor_listing_drafts.campaign.
