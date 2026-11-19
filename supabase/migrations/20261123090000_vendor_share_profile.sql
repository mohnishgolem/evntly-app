-- Share profile (vendor dashboard): a vendor shares their live listing as an
-- Instagram Story or a profile card with a QR code. Their links open
-- /vendor/<id>?src=share_story | share_link | share_qr.
--
-- 1. page_views.source also accepts the three share sources, so vendor page
--    views from a shared link or QR scan can be counted apart.
-- 2. quote_requests.share_source: the share source of the visit a quote
--    request was sent from (null for every other request). Customers may set
--    it when inserting their own request (column-level grant, as for the
--    other insertable columns) and never change it afterwards (no update grant).
--
-- Rollback: supabase/rollbacks/20261123090000_vendor_share_profile.down.sql

-- 1 ---------------------------------------------------------------------------
alter table public.page_views drop constraint if exists page_views_source_check;
alter table public.page_views add constraint page_views_source_check
  check (source is null or source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'meta_ads', 'referral', 'direct',
    'share_story', 'share_link', 'share_qr'));

-- 2 ---------------------------------------------------------------------------
alter table public.quote_requests add column if not exists share_source text;
alter table public.quote_requests drop constraint if exists quote_requests_share_source_check;
alter table public.quote_requests add constraint quote_requests_share_source_check
  check (share_source is null or share_source in ('share_story', 'share_link', 'share_qr'));

grant insert (share_source) on public.quote_requests to authenticated;
