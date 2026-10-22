-- Undo 20261029090000_account_suspension.sql. Unsuspend everyone first
-- (admin_set_account_suspension(..., false)) or bans stay in auth.users.

drop function if exists public.admin_set_account_suspension(text, boolean, text, boolean);
-- Restore the previous lockdown (without the suspension check) and the
-- risk overview from 20261028090100_risk_identity_fallbacks.sql, then:
alter table public.users drop constraint if exists users_suspension_reason_length;
alter table public.users drop column if exists suspension_reason;
alter table public.users drop column if exists suspended_at;
