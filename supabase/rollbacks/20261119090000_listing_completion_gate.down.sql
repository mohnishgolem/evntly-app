-- Rollback for 20261119090000_listing_completion_gate.sql.
-- Drafts left behind are moved to review so they don't disappear from the
-- admin queue once the app stops knowing about 'draft'.
select cron.unschedule(jobid) from cron.job where jobname = 'listing-reminders';

drop trigger if exists trg_service_providers_completion_gate on public.service_providers;
drop function if exists public.enforce_listing_complete_on_approval();
drop trigger if exists trg_beta_applications_draft_listing on public.beta_applications;
drop function if exists public.keep_draft_applications_started();
drop function if exists public.submit_listing_for_review(text);

create or replace function public.guard_service_providers_insert()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  new.status := 'pending_review';
  new.rating := 0;
  new.rating_sum := 0;
  new.review_count := 0;
  new.verified := false;
  new.founding_vendor := false;
  new.acceptance_rate := null;
  new.avg_response_hours := null;
  return new;
end;
$$;

update public.service_providers set status = 'pending_review' where status = 'draft';
update public.beta_applications a set status = 'submitted', submitted_at = now(), updated_at = now()
  where a.status = 'started' and a.provider_id is not null;

drop table if exists public.listing_setup_requests;
drop table if exists public.listing_completion_reminders;
drop function if exists public.listing_completion(text);
