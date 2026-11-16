-- Rollback for 20261117090000_vendor_pricing_models.sql
-- Only safe while every listing is still hourly: hourly_rate becomes required
-- again, so non-hourly listings must be converted (or removed) first:
--   select id, name, pricing_model from public.service_providers where pricing_model <> 'hourly';

revoke select (pricing_model, base_price) on public.service_providers from anon, authenticated;

alter table public.service_providers drop constraint if exists service_providers_price_matches_model;
alter table public.service_providers drop constraint if exists service_providers_pricing_model_check;

alter table public.service_providers alter column hourly_rate set not null;

alter table public.service_providers
  drop column if exists base_price,
  drop column if exists pricing_model;
