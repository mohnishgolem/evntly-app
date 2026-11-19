-- Share profile funnel: shared profile visits → new verified customer
-- accounts → quote requests sent, per channel (Story link, copied link, QR
-- card), plus how often vendors prepared a share (saved/copied — intent only,
-- it can't show whether anything was posted).
--
-- 1. share_funnel_events: rows the app writes with the service role.
--      account_created  a customer account whose sign-up started from a
--                       shared profile (its return path carried ?src=share_*);
--                       one row per account.
--      prepared         a vendor saved, copied or shared their Story/card.
--    No client access (RLS on, no grants), like funnel_events.
-- 2. admin_share_funnel(p_days): one row per channel for admins.
--      visitors     distinct browsers on /vendor/<id>?src=share_* (page_views)
--      accounts     share-attributed customer accounts created
--      verified     …of which the email is now confirmed (auth.users), so a
--                   confirmation link opened in another browser still counts
--      quotes       quote requests sent with that share_source
--      quotes_new   …of which from those verified share accounts
--      prepared     vendor save/copy/share actions (intent, not posts)
--    Admin accounts and browsers admins have used are left out, as in
--    admin_funnel.
--
-- Depends on 20261123090000_vendor_share_profile (page_views share sources,
-- quote_requests.share_source).
-- Rollback: supabase/rollbacks/20261124090000_share_funnel.down.sql

-- 1 ---------------------------------------------------------------------------
create table if not exists public.share_funnel_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('account_created', 'prepared')),
  source text not null check (source in ('share_story', 'share_link', 'share_qr')),
  vendor_id text,
  user_id uuid,
  detail text check (detail is null or detail ~ '^[a-z0-9_]{1,40}$')
);

create index if not exists share_funnel_events_created_idx on public.share_funnel_events (created_at desc);
-- An account is attributed once, to the share it signed up from.
create unique index if not exists share_funnel_events_account_uniq
  on public.share_funnel_events (user_id) where event = 'account_created';

alter table public.share_funnel_events enable row level security;
revoke all on public.share_funnel_events from anon, authenticated;

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
