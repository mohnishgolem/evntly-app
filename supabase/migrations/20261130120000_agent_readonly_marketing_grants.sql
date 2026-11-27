-- Read access for the marketing agent's KPIs (Phase 2), on the existing
-- read-only role evntly_agent_ro. No personal data: no names, emails, phones,
-- addresses, free-text notes, enquiry details or Stripe IDs.
-- Depends on 20261130110000_agent_readonly_role.sql.
-- Rollback: supabase/rollbacks/20261130120000_agent_readonly_marketing_grants.down.sql

-- Traffic and funnel events (visitor_id is a random first-party id; `detail`
-- free text and user_id are left out).
grant select (id, created_at, kind, vendor_id, source, visitor_id) on public.page_views to evntly_agent_ro;
grant select (id, created_at, event, source, campaign, visitor_id) on public.funnel_events to evntly_agent_ro;

-- Customer enquiries: funnel fields only (adds to the columns granted in the
-- role migration). No client_email/name, details, location, vendor_note.
grant select (id, status, event_type, event_date, origin, share_source, vendor_id,
              client_user_id, booking_id, expires_at, budget_range, estimated_guests)
  on public.quote_requests to evntly_agent_ro;

-- Bookings: status and value only. No names, emails, address, notes, Stripe ids.
grant select (id, created_at, status, escrow_status, service_type, event_date,
              provider_id, provider_owner_user_id, client_user_id, total_price, commission_percent)
  on public.bookings to evntly_agent_ro;
