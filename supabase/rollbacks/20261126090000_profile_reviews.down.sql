-- Rollback for 20261126090000_profile_reviews: drafts and the reviews column
-- of the share report go, then the review changes are undone (below).
drop table if exists public.review_drafts;
drop function if exists public.admin_share_funnel(integer);
drop function if exists public.admin_share_funnel_by_vendor(integer);
-- The share funnel functions as 20261124090000_share_funnel created them.
-- 2 ---------------------------------------------------------------------------
create or replace function public.admin_share_funnel(p_days integer default 30)
returns table (source text, visitors bigint, accounts bigint, verified bigint, quotes bigint, quotes_new bigint, prepared bigint)
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
    coalesce((select p.n from prepared p where p.source = c.source), 0)
  from channels c
  where public.is_admin()
  order by c.ord;
$$;

revoke execute on function public.admin_share_funnel(integer) from public, anon;
grant execute on function public.admin_share_funnel(integer) to authenticated;

-- 3 ---------------------------------------------------------------------------
create or replace function public.admin_share_funnel_by_vendor(p_days integer default 30)
returns table (vendor_id text, vendor_name text, source text, visitors bigint, accounts bigint, verified bigint, quotes bigint, quotes_new bigint, prepared bigint)
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
  prepared as (
    select e.vendor_id, e.source, count(*) as n from public.share_funnel_events e, since
    where e.event = 'prepared' and e.created_at >= since.t and (e.user_id is null or e.user_id not in (select id from admins))
    group by e.vendor_id, e.source
  ),
  pairs as (
    select vendor_id, source from views union select vendor_id, source from accounts
    union select vendor_id, source from quotes union select vendor_id, source from prepared
  )
  select p.vendor_id, sp.name, p.source,
    (select count(distinct v.visitor_id) from views v where v.vendor_id = p.vendor_id and v.source = p.source),
    (select count(*) from accounts a where a.vendor_id = p.vendor_id and a.source = p.source),
    (select count(*) from accounts a where a.vendor_id = p.vendor_id and a.source = p.source and a.verified),
    (select count(*) from quotes q where q.vendor_id = p.vendor_id and q.source = p.source),
    (select count(*) from quotes q where q.vendor_id = p.vendor_id and q.source = p.source
       and q.client_user_id in (select a.user_id from accounts a where a.vendor_id = p.vendor_id and a.source = p.source and a.verified)),
    coalesce((select pr.n from prepared pr where pr.vendor_id = p.vendor_id and pr.source = p.source), 0)
  from pairs p
  left join public.service_providers sp on sp.id = p.vendor_id
  where public.is_admin() and p.vendor_id is not null
  order by sp.name nulls last, p.source;
$$;

revoke execute on function public.admin_share_funnel_by_vendor(integer) from public, anon;
grant execute on function public.admin_share_funnel_by_vendor(integer) to authenticated;

-- Rollback for 20261126090000_profile_reviews. Past-client reviews are
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
alter table public.reviews drop constraint if exists reviews_share_source_check;
alter table public.reviews drop column if exists share_source;
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
