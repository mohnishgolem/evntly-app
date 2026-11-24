-- Vendor acquisition journey (Nov 2026): start a private listing before an
-- account exists, recover it securely, and let our team prepare a draft with
-- the owner's permission for them to claim.
--
-- NOT APPLIED. Needs Sai's approval before it touches production.
--
-- 1. vendor_listing_drafts: private, unpublished listing drafts.
--      * service role only (RLS on, no policies, no grants): every read and
--        write goes through server actions that check the secret link token,
--        the signed-in owner's verified email, or an admin session with MFA;
--      * only the SHA-256 of the link token is stored, so a database read
--        can't be turned into working resume or claim links;
--      * an 'assisted' draft (prepared by our team) must record who gave
--        permission, how and when, and the owner's email; only that verified
--        email can claim it;
--      * nothing here is ever public: a draft becomes a service_providers row
--        only when its owner signs in with a verified email, gives their ABN
--        and accepts the Vendor Service Agreement (same checks as before),
--        and goes live only after they submit it and an admin approves it.
--      * unclaimed drafts are deleted 30 days after they expire (pg_cron).
-- 2. funnel_events: the new journey steps (all anonymous, as before).
-- 3. page_views: the new vendor pages.
-- 4. admin_vendor_journey_funnel(p_days): visit → started → preview → saved
--    → verified account → listing → submitted → approved → completed →
--    first genuine enquiry. Admin + MFA only. Test/internal rules are the
--    same as admin_verified_vendor_funnel (20261121090000); keep in step.
--
-- Rollback: supabase/rollbacks/20261130090000_vendor_listing_drafts.down.sql

-- 1 ---------------------------------------------------------------------------
create table if not exists public.vendor_listing_drafts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  origin text not null default 'self' check (origin in ('self', 'assisted')),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 32768),
  -- Set when the owner asks for a "continue later" link, or by an admin for
  -- an assisted draft (the address the owner gave permission with).
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  -- Founding source of the visit that started it (self drafts), for the funnel.
  source text check (source is null or source ~ '^[a-z_]{1,40}$'),
  campaign text check (campaign is null or char_length(campaign) <= 40),
  visitor_id text check (visitor_id is null or char_length(visitor_id) between 8 and 64),
  -- Assisted drafts only: the record of the owner's permission.
  created_by uuid references auth.users (id) on delete set null,
  permission_note text check (permission_note is null or char_length(permission_note) between 10 and 1000),
  permission_at timestamptz,
  link_sent_at timestamptz,
  claim_opened_at timestamptz,
  -- Set once a verified account saves it as their listing.
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  provider_id text references public.service_providers (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  constraint vendor_listing_drafts_assisted_permission check (
    origin <> 'assisted'
    or (permission_note is not null and permission_at is not null and email is not null and created_by is not null)
  )
);

create index if not exists vendor_listing_drafts_email_idx on public.vendor_listing_drafts (lower(email)) where claimed_at is null;
create index if not exists vendor_listing_drafts_created_idx on public.vendor_listing_drafts (created_at);

alter table public.vendor_listing_drafts enable row level security;
revoke all on public.vendor_listing_drafts from anon, authenticated;

create or replace function public.purge_expired_vendor_listing_drafts()
returns void
language sql
security definer
set search_path to ''
as $$
  delete from public.vendor_listing_drafts
  where claimed_at is null and expires_at < now() - interval '30 days';
$$;
revoke all on function public.purge_expired_vendor_listing_drafts() from public, anon, authenticated;

select cron.schedule('purge-expired-vendor-listing-drafts', '23 3 * * *', $$select public.purge_expired_vendor_listing_drafts()$$);

-- 2 ---------------------------------------------------------------------------
alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check check (
  event = any (array[
    'claim_click', 'signup_view', 'signup_attempt', 'signup_error',
    'account_created', 'email_confirmed', 'listing_started', 'listing_submitted',
    -- vendor journey (20261130090000)
    'vendor_cta', 'calculator_used', 'builder_started', 'builder_step',
    'builder_preview', 'suggestion_used', 'draft_saved', 'draft_link_sent',
    'draft_resumed', 'save_clicked', 'claim_link_opened', 'listing_created',
    'assisted_requested'
  ]::text[])
);

-- 3 ---------------------------------------------------------------------------
alter table public.page_views drop constraint if exists page_views_kind_check;
alter table public.page_views add constraint page_views_kind_check
  check (kind in ('home', 'explore', 'vendor', 'plan', 'vendor_signup', 'bundles', 'founding', 'founding_claim', 'vendor_finish',
                  'vendor_landing', 'vendor_builder'));

-- 4 ---------------------------------------------------------------------------
-- Test / internal accounts (vendors AND customers), one definition for the
-- journey funnel and the growth dashboard. Same rules as
-- admin_verified_vendor_funnel (20261121090000) and
-- src/lib/acquisition/test-accounts.ts: keep all three in step.
create or replace function public.internal_test_user_ids()
returns setof text
language sql
stable
security definer
set search_path to ''
as $$
  select distinct u.id::text
  from public.users u
  join auth.users au on au.id::text = u.id::text
  left join public.service_providers sp on sp.owner_user_id::text = u.id::text
  left join public.beta_applications ba on ba.user_id::text = u.id::text
  where u.role = 'admin'
     or coalesce(sp.is_demo, false)
     or split_part(lower(u.email), '@', 2) = 'evntlyapp.com'
     or coalesce(ba.campaign, '') ilike 'qa%'
     or coalesce(sp.name, '') ~* '(^|[^a-z])(qa|test)([^a-z]|$)'
     or split_part(lower(u.email), '@', 1) ~ '\+(qa|test)'
     or coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '') ~* '(^|[^a-z])(qa|test)([^a-z]|$)'
     or u.id::text in ('75ff584a-0dc5-41cc-b69e-566f4bd731fa');
$$;
revoke all on function public.internal_test_user_ids() from public, anon, authenticated;

create or replace function public.admin_vendor_journey_funnel(p_days integer default 30)
returns table (step integer, stage text, people bigint)
language sql
stable
security definer
set search_path to ''
as $$
  with since as (select now() - make_interval(days => least(greatest(p_days, 1), 365)) as t),
  admins as (select u.id::text as id from public.users u where u.role = 'admin'),
  admin_browsers as (
    select distinct v.visitor_id from public.page_views v
    where v.visitor_id is not null and v.user_id::text in (select id from admins)
  ),
  -- Test / internal accounts: same rules as admin_verified_vendor_funnel.
  test_users as (select id from public.internal_test_user_ids() as t(id)),
  views as (
    select distinct v.visitor_id from public.page_views v, since
    where v.kind in ('vendor_landing', 'founding') and v.created_at >= since.t and v.visitor_id is not null
      and v.visitor_id not in (select visitor_id from admin_browsers)
      and (v.user_id is null or v.user_id::text not in (select id from admins))
  ),
  ev as (
    select f.event, f.visitor_id from public.funnel_events f, since
    where f.created_at >= since.t and f.visitor_id is not null
      and f.visitor_id not in (select visitor_id from admin_browsers)
  ),
  drafts as (
    select d.* from public.vendor_listing_drafts d, since
    where d.created_at >= since.t
      and (d.claimed_by is null or d.claimed_by::text not in (select id from test_users))
  ),
  listings as (
    select sp.id, sp.status,
      (select count(*) from public.portfolio_items pi where pi.provider_id = sp.id) as photos,
      (select count(*) from public.vendor_packages vp where vp.provider_id = sp.id and vp.active) as packages
    from public.service_providers sp
    where sp.id in (select provider_id from drafts where provider_id is not null)
  ),
  -- A genuine enquiry: a quote request from a real customer (not admin,
  -- team, QA or the vendor themselves) to that listing.
  genuine_enquiries as (
    select distinct q.vendor_id
    from public.quote_requests q
    join public.service_providers sp on sp.id = q.vendor_id
    where q.client_user_id is not null
      and q.client_user_id::text not in (select id from test_users)
      and q.client_user_id::text not in (select id from admins)
      and q.client_user_id::text <> coalesce(sp.owner_user_id::text, '')
      and not coalesce(sp.is_demo, false)
  )
  select * from (values
    (1,  'Visited a vendor page',                (select count(*) from views)),
    (2,  'Tried the scenario calculator',        (select count(distinct visitor_id) from ev where event = 'calculator_used')),
    (3,  'Started building a listing',           (select count(distinct visitor_id) from ev where event = 'builder_started')),
    (4,  'Reached the listing preview',          (select count(distinct visitor_id) from ev where event = 'builder_preview')),
    (5,  'Saved a private draft',                (select count(*) from drafts where origin = 'self')),
    (6,  'Drafts prepared by our team',          (select count(*) from drafts where origin = 'assisted')),
    (7,  'Claim links opened',                   (select count(*) from drafts where origin = 'assisted' and claim_opened_at is not null)),
    (8,  'Verified account saved the draft',     (select count(*) from drafts where claimed_by is not null)),
    (9,  'Listing created',                      (select count(*) from listings)),
    (10, 'Submitted for review',                 (select count(*) from listings where status <> 'draft')),
    (11, 'Approved',                             (select count(*) from listings where status = 'approved')),
    (12, 'Completed (3 photos + 1 package)',     (select count(*) from listings where status = 'approved' and photos >= 3 and packages >= 1)),
    (13, 'Received a genuine enquiry',           (select count(*) from listings where status = 'approved' and id in (select vendor_id from genuine_enquiries))),
    -- The success metric across ALL genuine vendors, however they joined.
    (14, 'All approved genuine vendors',         (select count(*) from public.service_providers sp
                                                   where sp.status = 'approved' and not coalesce(sp.is_demo, false)
                                                     and sp.owner_user_id::text not in (select id from test_users))),
    (15, '…of which received a genuine enquiry', (select count(*) from public.service_providers sp
                                                   where sp.status = 'approved' and not coalesce(sp.is_demo, false)
                                                     and sp.owner_user_id::text not in (select id from test_users)
                                                     and sp.id in (select vendor_id from genuine_enquiries)))
  ) as f(step, stage, people)
  where public.is_admin();
$$;

revoke all on function public.admin_vendor_journey_funnel(integer) from public, anon;
grant execute on function public.admin_vendor_journey_funnel(integer) to authenticated;
