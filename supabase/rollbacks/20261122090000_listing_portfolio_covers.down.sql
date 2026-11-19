-- Rollback for 20261122090000_listing_portfolio_covers: stop deriving
-- service_providers.portfolio_urls and clear it (it was unused before).
drop trigger if exists trg_portfolio_items_listing_covers on public.portfolio_items;
drop trigger if exists trg_service_providers_portfolio_urls on public.service_providers;
drop function if exists public.touch_listing_portfolio_urls();
drop function if exists public.set_listing_portfolio_urls();
drop function if exists public.listing_portfolio_cover_urls(text);
update public.service_providers set portfolio_urls = null;
