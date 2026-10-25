-- Restores the pre-hardening grants (Supabase defaults) and drops the indexes.
grant insert, update, delete, truncate, trigger, references on all tables in schema public to anon;
grant truncate, trigger, references on all tables in schema public to authenticated;
alter default privileges in schema public
  grant insert, update, delete, truncate, trigger, references on tables to anon;
alter default privileges in schema public
  grant truncate, trigger, references on tables to authenticated;

drop index if exists public.blocked_users_blocked_user_id_idx, public.booking_dispute_messages_author_user_id_idx,
  public.booking_disputes_opened_by_user_id_idx, public.combined_package_participants_proposed_by_user_id_idx,
  public.event_applications_organiser_user_id_idx, public.event_budget_items_organiser_user_id_idx,
  public.event_vendors_organiser_user_id_idx, public.group_chat_messages_sender_user_id_idx,
  public.leakage_events_recipient_user_id_idx, public.leakage_events_sender_user_id_idx,
  public.payment_events_milestone_id_idx, public.portfolio_items_provider_id_idx,
  public.reports_reporter_user_id_idx, public.reports_reported_user_id_idx,
  public.reviews_provider_id_idx, public.stage_checklist_items_done_by_user_id_idx;
create unique index if not exists rate_limit_buckets_bucket_key_key on public.rate_limit_buckets (bucket_key);
