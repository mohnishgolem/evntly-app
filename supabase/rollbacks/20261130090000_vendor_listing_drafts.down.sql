-- Rollback for 20261130090000_vendor_listing_drafts.
-- Deletes every unclaimed and claimed draft record (listings created from
-- them are NOT touched: they are ordinary service_providers rows).
select cron.unschedule('purge-expired-vendor-listing-drafts');
drop function if exists public.purge_expired_vendor_listing_drafts();
drop function if exists public.admin_vendor_journey_funnel(integer);
drop table if exists public.vendor_listing_drafts;

delete from public.funnel_events where event in (
  'vendor_cta', 'calculator_used', 'builder_started', 'builder_step', 'builder_preview', 'suggestion_used',
  'draft_saved', 'draft_link_sent', 'draft_resumed', 'save_clicked', 'claim_link_opened', 'listing_created', 'assisted_requested'
);
alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check check (
  event = any (array[
    'claim_click', 'signup_view', 'signup_attempt', 'signup_error',
    'account_created', 'email_confirmed', 'listing_started', 'listing_submitted'
  ]::text[])
);

delete from public.page_views where kind in ('vendor_landing', 'vendor_builder');
alter table public.page_views drop constraint if exists page_views_kind_check;
alter table public.page_views add constraint page_views_kind_check
  check (kind in ('home', 'explore', 'vendor', 'plan', 'vendor_signup', 'bundles', 'founding', 'founding_claim', 'vendor_finish'));
