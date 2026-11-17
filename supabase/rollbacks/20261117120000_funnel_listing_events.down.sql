-- Rollback for 20261117120000_funnel_listing_events.sql.
-- Removes the new events first so the narrower check can be restored.
delete from public.funnel_events where event in ('listing_started', 'listing_submitted');
alter table public.funnel_events drop constraint if exists funnel_events_event_check;
alter table public.funnel_events add constraint funnel_events_event_check check (
  event = any (array['claim_click', 'signup_view', 'signup_attempt', 'signup_error', 'account_created', 'email_confirmed']::text[])
);
