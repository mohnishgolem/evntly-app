-- Listing cards show the vendor's portfolio photos (19 Nov 2026: most vendors
-- have no profile photo, so search, the home page and the map showed a
-- category icon even for vendors with 26 photos).
--
-- service_providers.portfolio_urls (an unused text[] column that every public
-- vendor query already selects) becomes a derived cache: the listing's first 4
-- portfolio IMAGES (no videos, no HEIC, which browsers can't show), in the
-- vendor's order. It is always recomputed by the database:
--   * BEFORE INSERT/UPDATE on service_providers: whatever a client writes to
--     portfolio_urls is replaced with the real list.
--   * AFTER INSERT/UPDATE/DELETE on portfolio_items: the listing is touched so
--     the list follows uploads, reorders and deletes.
-- Portfolio URLs are already restricted to the vendor's own folder in the
-- public portfolio bucket (guard_portfolio_items_write), so nothing else can
-- end up in the column.
--
-- Rollback: supabase/rollbacks/20261122090000_listing_portfolio_covers.down.sql

create or replace function public.listing_portfolio_cover_urls(p_provider_id text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(media_url order by rn), '{}'::text[])
  from (
    select pi.media_url,
           row_number() over (order by pi.sort_order asc nulls last, pi.created_at, pi.id) as rn
    from public.portfolio_items pi
    where pi.provider_id = p_provider_id
      and pi.media_type = 'image'
      and pi.media_url !~* '\.heic$'
  ) ranked
  where rn <= 4;
$$;

revoke all on function public.listing_portfolio_cover_urls(text) from public, anon, authenticated;

create or replace function public.set_listing_portfolio_urls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.portfolio_urls := public.listing_portfolio_cover_urls(new.id);
  return new;
end;
$$;

revoke all on function public.set_listing_portfolio_urls() from public, anon, authenticated;

drop trigger if exists trg_service_providers_portfolio_urls on public.service_providers;
create trigger trg_service_providers_portfolio_urls
  before insert or update on public.service_providers
  for each row execute function public.set_listing_portfolio_urls();

create or replace function public.touch_listing_portfolio_urls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The BEFORE trigger above recomputes the list; this just fires it.
  if tg_op in ('INSERT', 'UPDATE') then
    update public.service_providers set portfolio_urls = null where id = new.provider_id;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.provider_id is distinct from coalesce(new.provider_id, '') then
    update public.service_providers set portfolio_urls = null where id = old.provider_id;
  end if;
  return null;
end;
$$;

revoke all on function public.touch_listing_portfolio_urls() from public, anon, authenticated;

drop trigger if exists trg_portfolio_items_listing_covers on public.portfolio_items;
create trigger trg_portfolio_items_listing_covers
  after insert or update or delete on public.portfolio_items
  for each row execute function public.touch_listing_portfolio_urls();

-- Backfill every listing (the BEFORE trigger fills it in).
update public.service_providers set portfolio_urls = null;
