-- Undo 20261028090000_disputes_and_risk.sql (+ 20261028090100). Dispute
-- threads and risk review notes are lost — export them first if needed.
-- Audit-log entries written by these functions are kept.

drop function if exists public.admin_mark_risk_reviewed(text, text);
drop function if exists public.admin_risk_overview(integer);
drop table if exists public.risk_reviews;

drop function if exists public.admin_update_dispute(uuid, text, text, text);
drop function if exists public.withdraw_booking_dispute(uuid);
drop function if exists public.add_dispute_message(uuid, text);
drop function if exists public.open_booking_dispute(text, text, text, text);
drop table if exists public.booking_dispute_messages;
drop table if exists public.booking_disputes;
