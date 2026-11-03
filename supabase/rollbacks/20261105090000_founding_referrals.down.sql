-- Rollback for 20261105090000_founding_referrals.sql. Referral history is
-- dropped; applications that came via referral become 'direct'.
drop function if exists public.admin_set_referral_spotlight(uuid, boolean);
drop function if exists public.my_referral_stats();
drop function if exists public.my_referral_code();
drop function if exists public.claim_founding_vendor_place(text, text, text);
-- Then re-run the claim_founding_vendor_place(text, text) definition from
-- 20261101090000_founding_vendor_beta.sql (and its anon revoke).
update public.beta_applications set source = 'direct' where source = 'referral';
alter table public.beta_applications drop constraint if exists beta_applications_source_check;
alter table public.beta_applications add constraint beta_applications_source_check
  check (source in ('instagram_bio', 'instagram_story', 'instagram_dm', 'waitlist_email', 'direct_outreach', 'direct'));
drop index if exists public.beta_applications_referred_by_idx;
alter table public.beta_applications drop constraint if exists beta_applications_no_self_referral;
alter table public.beta_applications drop constraint if exists beta_applications_referral_code_unique;
alter table public.beta_applications drop constraint if exists beta_applications_referral_code_format;
alter table public.beta_applications drop column if exists spotlight_posted_at;
alter table public.beta_applications drop column if exists referred_by;
alter table public.beta_applications drop column if exists referral_code;
