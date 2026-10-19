-- Seeded demo vendors carried hand-entered rating/review_count values with no
-- reviews behind them, so profiles showed "4.7 (21 reviews)" above "No reviews
-- yet". Ratings must only ever come from real reviews (recalculate_provider_rating
-- keeps them in sync from here on). The seeded values are kept in a private,
-- non-API schema in case they're ever needed for reference.

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

create table if not exists archive.seed_vendor_ratings (
  id text primary key,
  name text,
  rating double precision,
  review_count integer,
  rating_sum double precision,
  archived_at timestamptz not null default now()
);

with agg as (
  select p.id,
         count(r.id)::int as cnt,
         coalesce(sum(r.rating), 0)::float as total
  from public.service_providers p
  left join public.reviews r on r.provider_id = p.id
  group by p.id
),
stale as (
  select sp.id, sp.name, sp.rating, sp.review_count, sp.rating_sum
  from public.service_providers sp
  join agg on agg.id = sp.id
  where coalesce(sp.review_count, 0) <> agg.cnt
     or coalesce(sp.rating_sum, 0) <> agg.total
     or coalesce(sp.rating, 0) <> case when agg.cnt > 0 then agg.total / agg.cnt else 0 end
)
insert into archive.seed_vendor_ratings (id, name, rating, review_count, rating_sum)
select id, name, rating, review_count, rating_sum from stale
on conflict (id) do nothing;

update public.service_providers sp
set review_count = agg.cnt,
    rating_sum = agg.total,
    rating = case when agg.cnt > 0 then agg.total / agg.cnt else 0 end
from (
  select p.id,
         count(r.id)::int as cnt,
         coalesce(sum(r.rating), 0)::float as total
  from public.service_providers p
  left join public.reviews r on r.provider_id = p.id
  group by p.id
) agg
where agg.id = sp.id
  and (coalesce(sp.review_count, 0) <> agg.cnt
       or coalesce(sp.rating_sum, 0) <> agg.total
       or coalesce(sp.rating, 0) <> case when agg.cnt > 0 then agg.total / agg.cnt else 0 end);
