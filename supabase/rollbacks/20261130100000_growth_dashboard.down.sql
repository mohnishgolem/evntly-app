-- Rollback for 20261130100000_growth_dashboard. Deletes the spend log.
drop function if exists public.admin_growth_totals();
drop function if exists public.admin_growth_daily(integer);
drop table if exists public.acquisition_spend;
