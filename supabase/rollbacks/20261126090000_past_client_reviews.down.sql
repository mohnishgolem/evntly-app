-- Rollback for 20261126090000_past_client_reviews. Past-client reviews are
-- removed (they could never have been written under the old rules), the old
-- guard, public policy and rating function come back, and ratings are
-- recalculated from booking reviews.
delete from public.reviews where source = 'past_client';

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
       or new.reviewer_user_id is distinct from old.reviewer_user_id then
      raise exception 'Not authorized to change this field on a review';
    end if;
    return new;
  end if;
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

drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews for select using (true);
revoke select (source) on public.reviews from anon, authenticated;

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
  where provider_id = target_provider_id;
  update public.service_providers
  set review_count = agg.cnt,
      rating_sum = agg.total,
      rating = case when agg.cnt > 0 then agg.total / agg.cnt else 0 end
  where id = target_provider_id;
  return null;
end;
$function$;

drop index if exists public.reviews_source_created_idx;
drop index if exists public.reviews_past_client_once;
alter table public.reviews drop constraint if exists reviews_hidden_reason_check;
alter table public.reviews drop column if exists hidden_reason;
alter table public.reviews drop column if exists hidden_at;
alter table public.reviews drop constraint if exists reviews_source_check;
alter table public.reviews drop column if exists source;

-- Ratings from booking reviews only, as before.
update public.service_providers sp
set review_count = agg.cnt,
    rating_sum = agg.total,
    rating = case when agg.cnt > 0 then agg.total / agg.cnt else 0 end
from (
  select p.id, count(r.id)::int as cnt, coalesce(sum(r.rating), 0)::float as total
  from public.service_providers p left join public.reviews r on r.provider_id = p.id
  group by p.id
) agg
where agg.id = sp.id;
