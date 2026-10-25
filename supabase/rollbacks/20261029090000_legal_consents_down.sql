-- Rollback for 20261029090000_legal_consents.sql.
-- Roll back 20261029090100_legal_enforcement.sql first.
--
-- WARNING: dropping legal_consents destroys the acceptance audit trail.
-- Export it first:  copy (select * from public.legal_consents) to stdout csv header;
-- (users.terms_version / terms_accepted_at keep the latest Terms acceptance.)

drop trigger if exists guard_payment_plans_enabled on public.payment_plans;
drop function if exists public.guard_payment_plans_enabled();

drop function if exists public.cancel_account_deletion();
drop function if exists public.request_account_deletion(text);
drop table if exists public.account_deletion_requests;

drop function if exists public.my_legal_status();
drop function if exists public.set_marketing_consent(boolean, text);
drop function if exists public.record_signup_consents(text, text, boolean);
drop function if exists public.record_legal_acceptance(text[], text);
drop function if exists public.insert_legal_acceptances(text, text[], text);
drop function if exists public.has_current_legal_acceptance(text, text);
drop function if exists public.required_legal_documents(text);
drop table if exists public.legal_consents;
drop function if exists public.legal_consents_append_only();
drop table if exists public.legal_document_versions;
