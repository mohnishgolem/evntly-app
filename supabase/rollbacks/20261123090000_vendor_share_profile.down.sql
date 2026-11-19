-- Rollback for 20261123090000_vendor_share_profile. Page views recorded with a
-- share source lose it (the old check doesn't allow those values).
revoke insert (share_source) on public.quote_requests from authenticated;
alter table public.quote_requests drop constraint if exists quote_requests_share_source_check;
alter table public.quote_requests drop column if exists share_source;

update public.page_views set source = null where source in ('share_story', 'share_link', 'share_qr');
alter table public.page_views drop constraint if exists page_views_source_check;
alter table public.page_views add constraint page_views_source_check
  check (source is null or source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'meta_ads', 'referral', 'direct'));
