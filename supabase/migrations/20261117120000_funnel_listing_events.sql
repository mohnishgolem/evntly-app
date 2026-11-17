-- Founding funnel: record when a vendor opens the listing form
-- (listing_started, from the browser) and submits it (listing_submitted,
-- server-side), so the funnel no longer ends at "email confirmed".
-- Only widens the allowed event names; no rows change.
-- Rollback: supabase/rollbacks/20261117120000_funnel_listing_events.down.sql

alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check check (
  event = any (array[
    'claim_click', 'signup_view', 'signup_attempt', 'signup_error',
    'account_created', 'email_confirmed', 'listing_started', 'listing_submitted'
  ]::text[])
);
