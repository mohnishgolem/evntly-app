-- Rollback for 20261130120000_agent_readonly_marketing_grants.sql
revoke select (id, created_at, kind, vendor_id, source, visitor_id) on public.page_views from evntly_agent_ro;
revoke select (id, created_at, event, source, campaign, visitor_id) on public.funnel_events from evntly_agent_ro;
revoke select (id, status, event_type, event_date, origin, share_source, vendor_id,
               client_user_id, booking_id, expires_at, budget_range, estimated_guests)
  on public.quote_requests from evntly_agent_ro;
revoke select (id, created_at, status, escrow_status, service_type, event_date,
               provider_id, provider_owner_user_id, client_user_id, total_price, commission_percent)
  on public.bookings from evntly_agent_ro;
-- Note: quote_requests (vendor_user_id, service_type, responded_at, created_at)
-- stay granted by the role migration; revoking `id` above doesn't touch them.
