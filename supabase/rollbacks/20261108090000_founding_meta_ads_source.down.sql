-- Rollback for 20261108090000_founding_meta_ads_source.sql. Applications
-- that came from ads become 'direct'; then re-run the
-- claim_founding_vendor_place(text, text, text) definition (and its grants)
-- from 20261105090000_founding_referrals.sql.
update public.beta_applications set source = 'direct' where source = 'meta_ads';
alter table public.beta_applications drop constraint if exists beta_applications_source_check;
alter table public.beta_applications add constraint beta_applications_source_check
  check (source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'referral', 'direct'));
