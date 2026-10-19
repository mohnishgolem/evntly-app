-- Self-hosted error monitoring: server errors (Next's onRequestError) and
-- browser errors (error boundaries + window.onerror, posted to
-- /api/client-errors) land here. Written only by the service role; admins
-- read a grouped summary through admin_error_summary(). Kept 30 days.

create table if not exists public.error_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('server', 'client')),
  fingerprint text not null,
  message text not null,
  digest text,
  path text,
  route text,
  stack text,
  user_agent text,
  user_id uuid
);

create index if not exists error_events_fingerprint_created_idx
  on public.error_events (fingerprint, created_at desc);
create index if not exists error_events_created_idx
  on public.error_events (created_at desc);

alter table public.error_events enable row level security;
revoke all on public.error_events from anon, authenticated;

create or replace function public.admin_error_summary(p_days integer default 7)
returns table (
  fingerprint text,
  source text,
  message text,
  occurrences bigint,
  first_seen timestamptz,
  last_seen timestamptz,
  last_path text,
  last_route text,
  last_digest text,
  last_stack text
)
language sql
stable
security definer
set search_path to ''
as $$
  select e.fingerprint,
         (array_agg(e.source order by e.created_at desc))[1],
         (array_agg(e.message order by e.created_at desc))[1],
         count(*),
         min(e.created_at),
         max(e.created_at),
         (array_agg(e.path order by e.created_at desc))[1],
         (array_agg(e.route order by e.created_at desc))[1],
         (array_agg(e.digest order by e.created_at desc))[1],
         (array_agg(e.stack order by e.created_at desc))[1]
  from public.error_events e
  where public.is_admin()
    and e.created_at > now() - make_interval(days => least(greatest(p_days, 1), 30))
  group by e.fingerprint
  order by max(e.created_at) desc
  limit 100;
$$;

revoke execute on function public.admin_error_summary(integer) from public, anon;
grant execute on function public.admin_error_summary(integer) to authenticated;

select cron.schedule(
  'prune-error-events',
  '23 3 * * *',
  $$delete from public.error_events where created_at < now() - interval '30 days'$$
);
