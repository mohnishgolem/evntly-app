-- Rollback for 20261202090000_phone_agent. Deletes call logs, consent records
-- and the suppression list: export phone_suppression first and keep honouring
-- it (opt-outs must be respected even if this feature is removed).
drop function if exists public.admin_phone_agent_summary();
drop function if exists public.phone_agent_measures(timestamptz);
drop function if exists public.phone_agent_sms_stop(text, text);
drop function if exists public.phone_agent_web_test_call(text, text, text);
drop function if exists public.admin_phone_request_status(bigint, text);
drop function if exists public.admin_phone_request_callback(text, text, text, text, text, text, text);
drop function if exists public.phone_request_callback(text, text, text, text, text, text, text, text);
drop function if exists public.phone_agent_call_event(text, text, text, jsonb);
drop function if exists public.phone_agent_tool(text, text, text, jsonb);
drop function if exists public.admin_phone_followup_done(bigint, text);
drop function if exists public.admin_phone_review_call(uuid, smallint, text);
drop function if exists public.admin_phone_call_dialed(uuid, text, text);
drop function if exists public.phone_call_dialed(uuid, text, text, uuid);
drop function if exists public.admin_phone_start_call(uuid, text);
drop function if exists public.phone_start_call(uuid, text, uuid);
drop function if exists public.admin_phone_suppress(text, text);
drop function if exists public.admin_phone_record_dncr(text, boolean, text, text);
drop function if exists public.admin_phone_record_consent(uuid, text, text, text);
drop function if exists public.admin_phone_update_settings(jsonb);
drop function if exists public.admin_phone_call_blockers(uuid, text);
drop function if exists public.phone_call_blockers(uuid, text, timestamptz);
drop function if exists public.phone_legal_window_ok(timestamptz, text);
drop function if exists public.phone_now();
delete from public.acquisition_spend where channel = 'ai_phone';
alter table public.acquisition_spend drop constraint if exists acquisition_spend_channel_check;
alter table public.acquisition_spend add constraint acquisition_spend_channel_check check (channel in (
  'meta_ads', 'google_ads', 'instagram', 'events', 'print', 'partnerships', 'referral_rewards', 'tools', 'other'));
drop table if exists public.phone_call_requests;
drop table if exists public.phone_call_events;
drop table if exists public.phone_followups;
drop table if exists public.phone_calls;
drop table if exists public.phone_dncr_checks;
drop table if exists public.phone_consents;
drop table if exists public.phone_suppression;
drop function if exists public.phone_suppression_is_permanent();
drop table if exists public.phone_national_holidays;
drop table if exists public.phone_agent_settings;
