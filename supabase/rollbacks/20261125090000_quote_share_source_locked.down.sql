-- Rollback for 20261125090000_quote_share_source_locked.
drop trigger if exists trg_quote_requests_share_source_locked on public.quote_requests;
drop function if exists public.lock_quote_share_source();
