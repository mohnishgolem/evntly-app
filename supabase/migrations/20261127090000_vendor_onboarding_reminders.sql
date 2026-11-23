-- Vendor onboarding improvements (Nov 2026 onboarding review, items 2 and 10).
-- NOT APPLIED: Sai applies this to production after approving the PR, BEFORE
-- the code is deployed (the new page-view kind and reminders need it).
--
-- 1. page_views: count the "finish your listing" page (/vendor-dashboard/finish)
--    as its own kind, so the funnel can tell the claim page and the finish page
--    apart. Adds 'vendor_finish'; every existing kind is kept.
--
-- 2. vendor_onboarding_reminders: a log of the onboarding emails the hourly
--    listing-reminders job sends to vendors the draft reminders never reach:
--      no_listing_24h / no_listing_72h:
--        verified vendor accounts that claimed a Founding place but never
--        saved a listing (nothing exists yet to key a draft reminder on);
--      live_incomplete_48h / live_incomplete_7d:
--        approved listings still missing 3 photos or an active package.
--    One row per account and kind, written before the email is sent, so each
--    reminder goes out at most once. Service role only, like
--    listing_completion_reminders.

alter table public.page_views drop constraint if exists page_views_kind_check;
alter table public.page_views add constraint page_views_kind_check
  check (kind in ('home', 'explore', 'vendor', 'plan', 'vendor_signup', 'bundles', 'founding', 'founding_claim', 'vendor_finish'));

create table if not exists public.vendor_onboarding_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('no_listing_24h', 'no_listing_72h', 'live_incomplete_48h', 'live_incomplete_7d')),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.vendor_onboarding_reminders enable row level security;
revoke all on public.vendor_onboarding_reminders from anon, authenticated;

-- Rollback:
--   drop table if exists public.vendor_onboarding_reminders;
--   alter table public.page_views drop constraint if exists page_views_kind_check;
--   alter table public.page_views add constraint page_views_kind_check
--     check (kind in ('home', 'explore', 'vendor', 'plan', 'vendor_signup', 'bundles', 'founding', 'founding_claim'));
--   (delete from public.page_views where kind = 'vendor_finish'; first, if any rows exist)
