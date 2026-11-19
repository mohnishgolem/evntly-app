-- Reviews from the vendor profile: one flow for anyone who has hired the
-- vendor, wherever they booked. Decided with Sai (19–20 Nov 2026):
--   * reviews start from the public profile ("Write a review"), reached via
--     the vendor's Share profile links and QR codes;
--   * reviewers need a free Evntly account with a verified email; guests
--     draft first and come back to the same draft after verifying, even in
--     another browser (server-saved draft);
--   * a review of a completed Evntly booking is labelled "Booked on Evntly";
--     anyone else is "Past client · not booked on Evntly". Both go live
--     straight away, count towards the stars, and admins can hide them;
--   * reviews from shared profiles are tracked per channel, next to verified
--     sign-ups, so we can see whether vendors' posts bring new users.
--
-- 1. reviews.source / hidden_at / hidden_reason / share_source.
-- 2. guard_reviews_write: past-client reviews need a verified account, a
--    live real listing the reviewer doesn't own, once per vendor, 5 a day,
--    20–2,000 characters. source, share_source and hiding can't be changed by
--    customers. Booking reviews keep their rules.
-- 3. Hidden reviews leave the public list; source is publicly readable.
-- 4. recalculate_provider_rating ignores hidden reviews.
-- 5. review_drafts: a guest's unsent review, saved server-side (service role
--    only) so it survives sign-up and email verification in another browser.
-- 6. admin_share_funnel / admin_share_funnel_by_vendor gain a `reviews`
--    column: reviews submitted from a shared profile, per channel.
--
-- Depends on 20261124090000_share_funnel.
-- Rollback: supabase/rollbacks/20261126090000_profile_reviews.down.sql

-- 1 ---------------------------------------------------------------------------
alter table public.reviews add column if not exists source text not null default 'booking';
alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews add constraint reviews_source_check check (source in ('booking', 'past_client'));
alter table public.reviews add column if not exists hidden_at timestamptz;
alter table public.reviews add column if not exists hidden_reason text;
alter table public.reviews drop constraint if exists reviews_hidden_reason_check;
alter table public.reviews add constraint reviews_hidden_reason_check check (hidden_reason is null or char_length(hidden_reason) <= 500);
-- The Share profile channel of the visit the review was written from (null otherwise).
alter table public.reviews add column if not exists share_source text;
alter table public.reviews drop constraint if exists reviews_share_source_check;
alter table public.reviews add constraint reviews_share_source_check
  check (share_source is null or share_source in ('share_story', 'share_link', 'share_qr'));

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
       or new.share_source is distinct from old.share_source
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

-- 5 ---------------------------------------------------------------------------
create table if not exists public.review_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_id text not null,
  rating smallint check (rating is null or rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  event_type text check (event_type is null or char_length(event_type) <= 80),
  share_source text check (share_source is null or share_source in ('share_story', 'share_link', 'share_qr')),
  used_at timestamptz
);
create index if not exists review_drafts_created_idx on public.review_drafts (created_at);
alter table public.review_drafts enable row level security;
revoke all on public.review_drafts from anon, authenticated;

-- 6 ---------------------------------------------------------------------------
drop function if exists public.admin_share_funnel(integer);
create function public.admin_share_funnel(p_days integer default 30)
returns table (source text, visitors bigint, accounts bigint, verified bigint, quotes bigint, quotes_new bigint, reviews bigint, prepared bigint)
language sql
stable
security definer
set search_path to ''
as $$
  with since as (select now() - make_interval(days => least(greatest(p_days, 1), 365)) as t),
  admins as (select u.id::uuid as id from public.users u where u.role = 'admin'),
  admin_browsers as (select distinct v.visitor_id from public.page_views v where v.visitor_id is not null and v.user_id in (select id from admins)),
  channels(source, ord) as (values ('share_story', 1), ('share_link', 2), ('share_qr', 3)),
  views as (
    select v.source, v.visitor_id from public.page_views v, since
    where v.kind = 'vendor' and v.source in ('share_story', 'share_link', 'share_qr') and v.created_at >= since.t
      and (v.user_id is null or v.user_id not in (select id from admins))
      and v.visitor_id not in (select visitor_id from admin_browsers)
  ),
  accounts as (
    select e.source, e.user_id, au.email_confirmed_at is not null as verified
    from public.share_funnel_events e
    join auth.users au on au.id = e.user_id, since
    where e.event = 'account_created' and e.created_at >= since.t and e.user_id not in (select id from admins)
  ),
  quotes as (
    select q.share_source as source, q.client_user_id from public.quote_requests q, since
    where q.share_source is not null and q.created_at >= since.t
      and (q.client_user_id is null or q.client_user_id not in (select id from admins))
  ),
  reviews as (
    select r.share_source as source from public.reviews r, since
    where r.share_source is not null and r.created_at >= since.t
      and (r.reviewer_user_id is null or r.reviewer_user_id not in (select id from admins))
  ),
  prepared as (
    select e.source, count(*) as n from public.share_funnel_events e, since
    where e.event = 'prepared' and e.created_at >= since.t and (e.user_id is null or e.user_id not in (select id from admins))
    group by e.source
  )
  select c.source,
    (select count(distinct v.visitor_id) from views v where v.source = c.source),
    (select count(*) from accounts a where a.source = c.source),
    (select count(*) from accounts a where a.source = c.source and a.verified),
    (select count(*) from quotes q where q.source = c.source),
    (select count(*) from quotes q where q.source = c.source
       and q.client_user_id in (select a.user_id from accounts a where a.source = c.source and a.verified)),
    (select count(*) from reviews r where r.source = c.source),
    coalesce((select p.n from prepared p where p.source = c.source), 0)
  from channels c
  where public.is_admin()
  order by c.ord;
$$;

revoke execute on function public.admin_share_funnel(integer) from public, anon;
grant execute on function public.admin_share_funnel(integer) to authenticated;

drop function if exists public.admin_share_funnel_by_vendor(integer);
create function public.admin_share_funnel_by_vendor(p_days integer default 30)
returns table (vendor_id text, vendor_name text, source text, visitors bigint, accounts bigint, verified bigint, quotes bigint, quotes_new bigint, reviews bigint, prepared bigint)
language sql
stable
security definer
set search_path to ''
as $$
  with since as (select now() - make_interval(days => least(greatest(p_days, 1), 365)) as t),
  admins as (select u.id::uuid as id from public.users u where u.role = 'admin'),
  admin_browsers as (select distinct v.visitor_id from public.page_views v where v.visitor_id is not null and v.user_id in (select id from admins)),
  views as (
    select v.vendor_id::text as vendor_id, v.source, v.visitor_id from public.page_views v, since
    where v.kind = 'vendor' and v.source in ('share_story', 'share_link', 'share_qr') and v.created_at >= since.t
      and (v.user_id is null or v.user_id not in (select id from admins))
      and v.visitor_id not in (select visitor_id from admin_browsers)
  ),
  accounts as (
    select e.vendor_id, e.source, e.user_id, au.email_confirmed_at is not null as verified
    from public.share_funnel_events e
    join auth.users au on au.id = e.user_id, since
    where e.event = 'account_created' and e.created_at >= since.t and e.user_id not in (select id from admins)
  ),
  quotes as (
    select q.vendor_id::text as vendor_id, q.share_source as source, q.client_user_id from public.quote_requests q, since
    where q.share_source is not null and q.created_at >= since.t
      and (q.client_user_id is null or q.client_user_id not in (select id from admins))
  ),
  reviews as (
    select r.provider_id as vendor_id, r.share_source as source from public.reviews r, since
    where r.share_source is not null and r.created_at >= since.t
      and (r.reviewer_user_id is null or r.reviewer_user_id not in (select id from admins))
  ),
  prepared as (
    select e.vendor_id, e.source, count(*) as n from public.share_funnel_events e, since
    where e.event = 'prepared' and e.created_at >= since.t and (e.user_id is null or e.user_id not in (select id from admins))
    group by e.vendor_id, e.source
  ),
  pairs as (
    select vendor_id, source from views union select vendor_id, source from accounts
    union select vendor_id, source from quotes union select vendor_id, source from reviews
    union select vendor_id, source from prepared
  )
  select p.vendor_id, sp.name, p.source,
    (select count(distinct v.visitor_id) from views v where v.vendor_id = p.vendor_id and v.source = p.source),
    (select count(*) from accounts a where a.vendor_id = p.vendor_id and a.source = p.source),
    (select count(*) from accounts a where a.vendor_id = p.vendor_id and a.source = p.source and a.verified),
    (select count(*) from quotes q where q.vendor_id = p.vendor_id and q.source = p.source),
    (select count(*) from quotes q where q.vendor_id = p.vendor_id and q.source = p.source
       and q.client_user_id in (select a.user_id from accounts a where a.vendor_id = p.vendor_id and a.source = p.source and a.verified)),
    (select count(*) from reviews r where r.vendor_id = p.vendor_id and r.source = p.source),
    coalesce((select pr.n from prepared pr where pr.vendor_id = p.vendor_id and pr.source = p.source), 0)
  from pairs p
  left join public.service_providers sp on sp.id = p.vendor_id
  where public.is_admin() and p.vendor_id is not null
  order by sp.name nulls last, p.source;
$$;

revoke execute on function public.admin_share_funnel_by_vendor(integer) from public, anon;
grant execute on function public.admin_share_funnel_by_vendor(integer) to authenticated;
