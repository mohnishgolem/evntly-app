-- Hardening + indexes (2026-10-25 security/performance pass).
--
-- 1. Signed-out visitors (anon) held INSERT/UPDATE/DELETE/TRUNCATE on most
--    tables; only RLS stopped them (every write policy needs auth.uid()).
--    Revoke what anon can never legitimately use, so a future policy slip
--    can't open a write path. SELECT is left as is: public pages read
--    approved listings, reviews, packages and open event listings.
-- 2. TRUNCATE/TRIGGER/REFERENCES aren't used by the API for anyone and
--    TRUNCATE bypasses RLS entirely — revoke them from anon and authenticated.
--    Default privileges are tightened the same way for future tables.
-- 3. Indexes for the 16 foreign keys without one (vendor profile pages look
--    up portfolio_items and reviews by provider_id on every view), and drop
--    a duplicate of rate_limit_buckets' unique constraint.
--
-- Rollback: supabase/rollbacks/20261029110000_hardening_grants_indexes.down.sql

revoke insert, update, delete, truncate, trigger, references
  on all tables in schema public from anon;
revoke truncate, trigger, references
  on all tables in schema public from authenticated;

alter default privileges in schema public
  revoke insert, update, delete, truncate, trigger, references on tables from anon;
alter default privileges in schema public
  revoke truncate, trigger, references on tables from authenticated;

create index if not exists blocked_users_blocked_user_id_idx on public.blocked_users (blocked_user_id);
create index if not exists booking_dispute_messages_author_user_id_idx on public.booking_dispute_messages (author_user_id);
create index if not exists booking_disputes_opened_by_user_id_idx on public.booking_disputes (opened_by_user_id);
create index if not exists combined_package_participants_proposed_by_user_id_idx on public.combined_package_participants (proposed_by_user_id);
create index if not exists event_applications_organiser_user_id_idx on public.event_applications (organiser_user_id);
create index if not exists event_budget_items_organiser_user_id_idx on public.event_budget_items (organiser_user_id);
create index if not exists event_vendors_organiser_user_id_idx on public.event_vendors (organiser_user_id);
create index if not exists group_chat_messages_sender_user_id_idx on public.group_chat_messages (sender_user_id);
create index if not exists leakage_events_recipient_user_id_idx on public.leakage_events (recipient_user_id);
create index if not exists leakage_events_sender_user_id_idx on public.leakage_events (sender_user_id);
create index if not exists payment_events_milestone_id_idx on public.payment_events (milestone_id);
create index if not exists portfolio_items_provider_id_idx on public.portfolio_items (provider_id);
create index if not exists reports_reporter_user_id_idx on public.reports (reporter_user_id);
create index if not exists reports_reported_user_id_idx on public.reports (reported_user_id);
create index if not exists reviews_provider_id_idx on public.reviews (provider_id);
create index if not exists stage_checklist_items_done_by_user_id_idx on public.stage_checklist_items (done_by_user_id);

drop index if exists public.rate_limit_buckets_bucket_key_key;
