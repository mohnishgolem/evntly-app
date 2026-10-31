-- Rollback for 20261101090000_founding_vendor_beta.sql. Deletes all beta
-- waitlist, invitation, application and feedback data — export first.

drop trigger if exists trg_service_providers_beta_link on public.service_providers;
drop function if exists public.link_beta_application_to_listing();
drop function if exists public.beta_unsubscribe(text);
drop function if exists public.admin_record_beta_invitation(uuid, boolean, text, text);
drop function if exists public.admin_prepare_beta_invitation(uuid, text);
drop function if exists public.admin_set_beta_program(integer, integer, integer, integer);
drop function if exists public.admin_decide_founding_application(uuid, text, text);
drop function if exists public.update_my_founding_application(text);
drop function if exists public.claim_founding_vendor_place(text, text);
drop function if exists public.beta_invite_lookup(text);
drop function if exists public.founding_vendor_places();
drop table if exists public.beta_feedback;
drop table if exists public.beta_applications;
drop table if exists public.beta_invitations;
drop table if exists public.vendor_waitlist;
drop table if exists public.beta_program;
