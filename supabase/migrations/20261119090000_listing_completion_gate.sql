-- Listing completion gate (vendor acquisition recovery, R1–R5), 19 Nov 2026.
--
-- Until now a listing went straight to review after the 5-step form, and
-- photos and packages were separate pages found after approval: 9 of 10
-- approved vendors had none. From here:
--
-- 1. A listing a vendor creates starts as a 'draft'. It is saved on the
--    server, so the vendor can leave and come back, and nobody else sees it.
-- 2. submit_listing_for_review() moves the owner's draft to 'pending_review',
--    and only when it has at least 3 portfolio items and 1 active package.
--    It also moves a founding application from 'started' to 'submitted'.
-- 3. No listing can become 'approved' unless it is complete. Listings that
--    are already approved keep their status: the check only runs when the
--    status changes to 'approved'. Sample (is_demo) listings are exempt.
-- 4. A founding application can't sit at 'submitted' while its listing is
--    still a draft (claiming, rejoining or the insert link would do that).
-- 5. listing_completion_reminders records the 24 h / 72 h reminder emails,
--    so each is sent once. Written by the service role only.
-- 6. listing_setup_requests holds "set it up for me" requests (done-with-you).
--    The vendor still reviews the listing and submits it themselves.
-- 7. pg_cron calls /api/cron/listing-reminders hourly (same pattern as
--    quote-followups: shared secret in app_settings).
--
-- Rollback: supabase/rollbacks/20261119090000_listing_completion_gate.down.sql

-- ── Completeness ────────────────────────────────────────────────────────

create or replace function public.listing_completion(p_provider_id text)
returns table (photos integer, packages integer, complete boolean)
language sql
stable
security definer
set search_path to ''
as $$
  select p.n, k.n, (p.n >= 3 and k.n >= 1)
  from (select count(*)::int as n from public.portfolio_items where provider_id = p_provider_id) p,
       (select count(*)::int as n from public.vendor_packages where provider_id = p_provider_id and active) k;
$$;

revoke all on function public.listing_completion(text) from public, anon, authenticated;

-- ── 1. New vendor listings start as drafts ──────────────────────────────

create or replace function public.guard_service_providers_insert()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.is_privileged_writer() or public.is_admin() then return new; end if;
  new.status := 'draft';
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

-- ── 3. Only complete listings can be approved ───────────────────────────

create or replace function public.enforce_listing_complete_on_approval()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  c record;
begin
  if new.status = 'approved'
     and old.status is distinct from 'approved'
     and not coalesce(new.is_demo, false) then
    select * into c from public.listing_completion(new.id);
    if not c.complete then
      raise exception 'This listing can''t be approved yet: it needs at least 3 photos and 1 active package (it has % and %).',
        c.photos, c.packages
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_providers_completion_gate on public.service_providers;
create trigger trg_service_providers_completion_gate
  before update of status on public.service_providers
  for each row execute function public.enforce_listing_complete_on_approval();

-- ── 4. Applications wait while the listing is a draft ───────────────────

create or replace function public.keep_draft_applications_started()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status = 'submitted'
     and new.provider_id is not null
     and exists (select 1 from public.service_providers sp where sp.id = new.provider_id and sp.status = 'draft') then
    new.status := 'started';
    new.submitted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_beta_applications_draft_listing on public.beta_applications;
create trigger trg_beta_applications_draft_listing
  before insert or update on public.beta_applications
  for each row execute function public.keep_draft_applications_started();

-- ── 2. The vendor submits a complete draft ──────────────────────────────

create or replace function public.submit_listing_for_review(p_provider_id text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  sp record;
  c record;
  app_id uuid;
begin
  if uid is null then raise exception 'Log in first.' using errcode = '42501'; end if;

  select id, status, owner_user_id into sp
  from public.service_providers
  where id = p_provider_id
  for update;
  if not found or sp.owner_user_id is distinct from uid then
    raise exception 'Listing not found.' using errcode = 'P0001';
  end if;
  -- Already submitted, live or decided: nothing to do.
  if sp.status <> 'draft' then return sp.status; end if;

  select * into c from public.listing_completion(sp.id);
  if c.photos < 3 then
    raise exception 'Add at least 3 photos of your work first (you have %).', c.photos using errcode = 'P0001';
  end if;
  if c.packages < 1 then
    raise exception 'Add at least one package first.' using errcode = 'P0001';
  end if;

  update public.service_providers set status = 'pending_review' where id = sp.id;

  update public.beta_applications
    set status = 'submitted', submitted_at = now(), updated_at = now()
    where user_id = uid and provider_id = sp.id and status = 'started'
    returning id into app_id;

  return case when app_id is null then 'pending_review' else 'founding_submitted' end;
end;
$$;

revoke all on function public.submit_listing_for_review(text) from public, anon;
grant execute on function public.submit_listing_for_review(text) to authenticated;

-- ── 5. Reminder log ─────────────────────────────────────────────────────

create table if not exists public.listing_completion_reminders (
  provider_id text not null references public.service_providers (id) on delete cascade,
  kind text not null check (kind in ('24h', '72h')),
  sent_at timestamptz not null default now(),
  primary key (provider_id, kind)
);

alter table public.listing_completion_reminders enable row level security;
revoke all on public.listing_completion_reminders from anon, authenticated;

-- ── 6. Done-with-you setup requests ─────────────────────────────────────

create table if not exists public.listing_setup_requests (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.service_providers (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  services text not null check (char_length(btrim(services)) between 10 and 2000),
  photo_links text check (photo_links is null or char_length(photo_links) <= 1000),
  -- The vendor confirms they own the photos (or have permission) and that
  -- Evntly may add them to their listing. Required.
  photo_permission boolean not null check (photo_permission),
  status text not null default 'open' check (status in ('open', 'ready', 'closed')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists listing_setup_requests_one_open
  on public.listing_setup_requests (provider_id) where status = 'open';

alter table public.listing_setup_requests enable row level security;

drop policy if exists listing_setup_requests_insert_own on public.listing_setup_requests;
create policy listing_setup_requests_insert_own on public.listing_setup_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'open'
    and admin_note is null
    and exists (
      select 1 from public.service_providers sp
      where sp.id = provider_id and sp.owner_user_id = (select auth.uid()) and sp.status = 'draft'
    )
  );

drop policy if exists listing_setup_requests_select on public.listing_setup_requests;
create policy listing_setup_requests_select on public.listing_setup_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists listing_setup_requests_update_admin on public.listing_setup_requests;
create policy listing_setup_requests_update_admin on public.listing_setup_requests
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.listing_setup_requests from anon;
grant select, insert, update on public.listing_setup_requests to authenticated;

-- ── 7. Hourly reminders ─────────────────────────────────────────────────

select cron.unschedule(jobid) from cron.job where jobname = 'listing-reminders';
select cron.schedule(
  'listing-reminders',
  '7 * * * *',
  $$
  select net.http_post(
    url := (select value from public.app_settings where key = 'site_url') || '/api/cron/listing-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select value from public.app_settings where key = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
