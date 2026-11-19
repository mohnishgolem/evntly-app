-- Past-client reviews: a vendor's earlier clients (who booked them outside
-- Evntly) can review them, so new listings aren't empty. Decided with Sai on
-- 19 Nov 2026:
--   * reviewers need a free Evntly account with a verified email;
--   * reviews go live straight away, labelled "Past client — not booked on
--     Evntly", and admins can hide one;
--   * they count towards the star rating (hidden ones don't).
--
-- 1. reviews.source ('booking' | 'past_client') and reviews.hidden_at/
--    hidden_reason (admins only). Existing rows are 'booking'.
-- 2. guard_reviews_write: past-client reviews need no booking but must come
--    from a verified account, about a live real listing the reviewer doesn't
--    own, once per vendor, at most 5 a day, with a written comment. Nobody
--    but admins/the service role can set source on update, or hide a review.
-- 3. The public sees hidden reviews no more; reviewers and admins still do.
--    `source` becomes readable (column grants, like the other public columns).
-- 4. recalculate_provider_rating ignores hidden reviews.
--
-- Rollback: supabase/rollbacks/20261126090000_past_client_reviews.down.sql

-- 1 ---------------------------------------------------------------------------
alter table public.reviews add column if not exists source text not null default 'booking';
alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews add constraint reviews_source_check check (source in ('booking', 'past_client'));
alter table public.reviews add column if not exists hidden_at timestamptz;
alter table public.reviews add column if not exists hidden_reason text;
alter table public.reviews drop constraint if exists reviews_hidden_reason_check;
alter table public.reviews add constraint reviews_hidden_reason_check check (hidden_reason is null or char_length(hidden_reason) <= 500);

-- One past-client review per person per vendor.
create unique index if not exists reviews_past_client_once
  on public.reviews (provider_id, reviewer_user_id) where source = 'past_client';
create index if not exists reviews_source_created_idx on public.reviews (source, created_at desc);

-- 2 ---------------------------------------------------------------------------
create or replace function public.guard_reviews_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if public.is_admin() or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if new.rating is null or new.rating <> trunc(new.rating) or new.rating < 1 or new.rating > 5 then
    raise exception 'Rating must be a whole number from 1 to 5';
  end if;
  if tg_op = 'UPDATE' then
    if new.provider_id is distinct from old.provider_id
       or new.booking_id is distinct from old.booking_id
       or new.reviewer_email is distinct from old.reviewer_email
       or new.reviewer_user_id is distinct from old.reviewer_user_id
       or new.source is distinct from old.source
       or new.hidden_at is distinct from old.hidden_at
       or new.hidden_reason is distinct from old.hidden_reason then
      raise exception 'Not authorized to change this field on a review';
    end if;
    return new;
  end if;

  if new.hidden_at is not null or new.hidden_reason is not null then
    raise exception 'Not authorized to change this field on a review';
  end if;

  if new.source = 'past_client' then
    if new.booking_id is not null then
      raise exception 'A past-client review is not linked to an Evntly booking';
    end if;
    if new.reviewer_user_id is distinct from auth.uid() then
      raise exception 'Not authorized to post this review';
    end if;
    if not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null) then
      raise exception 'Verify your email before posting a review';
    end if;
    if not exists (
      select 1 from public.service_providers sp
      where sp.id = new.provider_id and sp.status = 'approved' and coalesce(sp.is_demo, false) = false
    ) then
      raise exception 'This vendor can''t receive reviews';
    end if;
    if exists (select 1 from public.service_providers sp where sp.id = new.provider_id and sp.owner_user_id = auth.uid()) then
      raise exception 'You can''t review your own business';
    end if;
    if char_length(coalesce(btrim(new.comment), '')) < 20 or char_length(new.comment) > 2000 then
      raise exception 'Write a few words about your experience (20 to 2,000 characters)';
    end if;
    if exists (
      select 1 from public.reviews r
      where r.provider_id = new.provider_id and r.reviewer_user_id = auth.uid() and r.source = 'past_client'
    ) then
      raise exception 'You have already reviewed this vendor';
    end if;
    if (select count(*) from public.reviews r
        where r.reviewer_user_id = auth.uid() and r.source = 'past_client' and r.created_at > now() - interval '1 day') >= 5 then
      raise exception 'You can post up to 5 past-client reviews a day';
    end if;
    return new;
  end if;

  -- Reviews of an Evntly booking (unchanged).
  if not exists (
    select 1 from public.bookings b
    where b.id = new.booking_id
      and b.provider_id = new.provider_id
      and b.client_user_id = auth.uid()
      and b.status = 'completed'
  ) then
    raise exception 'You can only review a vendor after a completed booking';
  end if;
  if exists (
    select 1 from public.reviews r
    where r.booking_id = new.booking_id and r.reviewer_user_id = auth.uid()
  ) then
    raise exception 'You have already reviewed this booking';
  end if;
  return new;
end;
$function$;

-- 3 ---------------------------------------------------------------------------
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews for select
  using (hidden_at is null or reviewer_user_id = (select auth.uid()) or public.is_admin());

grant select (source) on public.reviews to anon, authenticated;

-- 4 ---------------------------------------------------------------------------
create or replace function public.recalculate_provider_rating()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_provider_id text;
  agg record;
begin
  target_provider_id := coalesce(new.provider_id, old.provider_id);

  select count(*)::int as cnt, coalesce(sum(rating), 0)::float as total
  into agg
  from public.reviews
  where provider_id = target_provider_id and hidden_at is null;

  update public.service_providers
  set review_count = agg.cnt,
      rating_sum = agg.total,
      rating = case when agg.cnt > 0 then agg.total / agg.cnt else 0 end
  where id = target_provider_id;

  return null;
end;
$function$;
