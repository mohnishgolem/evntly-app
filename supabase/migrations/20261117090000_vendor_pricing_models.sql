-- Vendor pricing models: not every vendor charges by the hour.
--
-- An MC's fee covers preparation as well as the event, a decorator prices a
-- setup, many photographers sell packages. Until now every listing needed an
-- hourly rate (hourly_rate NOT NULL), so those vendors had to invent one.
--
--   hourly → hourly_rate is the price per hour (all existing listings)
--   fixed  → base_price is the price per event
--   from   → base_price is a starting price
--   quote  → no public price; customers ask for a quote
--
-- hourly_rate keeps meaning "per hour" everywhere it is read (search filters,
-- estimates), so it is only set for hourly listings. Existing rows default to
-- 'hourly' and keep their rate unchanged.

alter table public.service_providers
  add column if not exists pricing_model text not null default 'hourly',
  add column if not exists base_price numeric(10, 2);

alter table public.service_providers
  drop constraint if exists service_providers_pricing_model_check;
alter table public.service_providers
  add constraint service_providers_pricing_model_check
  check (pricing_model in ('hourly', 'fixed', 'from', 'quote'));

alter table public.service_providers
  alter column hourly_rate drop not null;

-- The price fields must match the chosen model.
alter table public.service_providers
  drop constraint if exists service_providers_price_matches_model;
alter table public.service_providers
  add constraint service_providers_price_matches_model check (
    (pricing_model = 'hourly' and hourly_rate > 0 and base_price is null)
    or (pricing_model in ('fixed', 'from') and base_price > 0 and hourly_rate is null)
    or (pricing_model = 'quote' and hourly_rate is null and base_price is null)
  );

-- SELECT on service_providers is granted per column, so new public columns
-- need an explicit grant (INSERT/UPDATE are table-level, limited by RLS).
grant select (pricing_model, base_price) on public.service_providers to anon, authenticated;
