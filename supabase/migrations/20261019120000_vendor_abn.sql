-- Vendor ABN and GST status, for booking invoices (corporate organisers need
-- an ABN on every invoice). ABNs are public on the ABR, so they're readable
-- like the rest of the public listing. Checksum is validated in the app;
-- the DB enforces the 11-digit shape.

alter table public.service_providers
  add column if not exists abn text,
  add column if not exists gst_registered boolean not null default false;

alter table public.service_providers
  drop constraint if exists service_providers_abn_format;
alter table public.service_providers
  add constraint service_providers_abn_format check (abn is null or abn ~ '^[0-9]{11}$');

-- SELECT on service_providers is granted per column (private columns are
-- withheld), so new public columns need an explicit grant.
grant select (abn, gst_registered) on public.service_providers to anon, authenticated;
