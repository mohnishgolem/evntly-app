-- admin_risk_overview: attribute signals whose rows lack a user id (vendor
-- reports name the listing; some leak rows only carry sender_id or an email).

create or replace function public.admin_risk_overview(p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz;
  result jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  since := now() - make_interval(days => greatest(7, least(coalesce(p_days, 90), 365)));

  with signals as (
    -- Off-platform contact attempts (messages carrying phone/email/handles).
    -- Older/attachment rows may only carry sender_id (an account id) or an email.
    select coalesce(sender_user_id::text,
                    case when sender_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then lower(sender_id) end,
                    (select u.id from public.users u where lower(u.email) = lower(le.sender_email) limit 1)) as user_id,
           'contact_attempt' as kind, 3 as weight, created_at as at, category as detail
    from public.leakage_events le where created_at >= since
    union all
    -- Reports from other users.
    -- Reports on a listing name the listing, not its owner: resolve through it.
    select coalesce(r.reported_user_id::text,
                    (select sp.owner_user_id::text from public.service_providers sp
                      where r.content_type = 'vendor' and sp.id = r.content_id),
                    (select u.id from public.users u where lower(u.email) = lower(r.reported_email) limit 1)),
           'reported', 4, r.created_at, r.reason
    from public.reports r where r.created_at >= since
    union all
    -- Blocked by another user.
    select coalesce(bu.blocked_user_id::text,
                    (select u.id from public.users u where lower(u.email) = lower(bu.blocked_email) limit 1)),
           'blocked', 2, bu.created_at, null
    from public.blocked_users bu where bu.created_at >= since
    union all
    -- Booking from an accepted quote cancelled within 72 hours: a common
    -- pattern when a deal moves off-platform. Counts for both parties.
    select u.uid::text, 'quick_cancel', 3, b.updated_at, b.id
    from public.bookings b
    cross join lateral (values (b.client_user_id), (b.provider_owner_user_id)) u(uid)
    where b.status = 'cancelled' and b.updated_at - b.created_at < interval '72 hours'
      and b.created_at >= since and u.uid is not null
      and exists (select 1 from public.quote_requests q where q.booking_id = b.id)
    union all
    -- Disputes raised against this user (by the other party).
    select (case when d.opened_by_role = 'customer' then d.vendor_user_id else d.customer_user_id end)::text,
           'dispute_against', 4, d.created_at, d.reason
    from public.booking_disputes d where d.created_at >= since
    union all
    -- Quote-request burst: 15+ requests from one customer in a day.
    select x.uid::text, 'request_burst', 5, x.day, x.n::text
    from (
      select client_user_id as uid, date_trunc('day', created_at) as day, count(*) as n
      from public.quote_requests where created_at >= since and client_user_id is not null
      group by 1, 2 having count(*) >= 15
    ) x
    union all
    -- An ABN used by listings under different owners.
    select sp.owner_user_id::text, 'shared_abn', 6, sp.created_at, sp.abn
    from public.service_providers sp
    where sp.abn is not null and sp.owner_user_id is not null and not sp.is_demo
      and exists (select 1 from public.service_providers o
                  where o.abn = sp.abn and o.owner_user_id is distinct from sp.owner_user_id and not o.is_demo)
  ),
  scored as (
    select s.user_id,
           sum(s.weight) as score,
           max(s.at) as latest_at,
           jsonb_agg(jsonb_build_object('kind', s.kind, 'at', s.at, 'detail', s.detail) order by s.at desc) as evidence
    from signals s where s.user_id is not null group by s.user_id
  )
  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.score desc, r.latest_at desc), '[]'::jsonb) into result
  from (
    select sc.user_id, u.email, u.role, sc.score,
           case when sc.score >= 12 then 'high' when sc.score >= 5 then 'medium' else 'low' end as level,
           sc.latest_at,
           (select jsonb_object_agg(k, n) from (
              select e->>'kind' as k, count(*) as n from jsonb_array_elements(sc.evidence) e group by 1) c) as counts,
           (select jsonb_agg(e) from (select e from jsonb_array_elements(sc.evidence) e limit 12) z) as evidence,
           (select coalesce(jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'status', sp.status)), '[]'::jsonb)
              from public.service_providers sp where sp.owner_user_id::text = sc.user_id) as listings,
           rv.reviewed_at, rv.note as review_note,
           (rv.reviewed_at is not null and rv.reviewed_at >= sc.latest_at) as reviewed
    from scored sc
    left join public.users u on u.id = sc.user_id
    left join public.risk_reviews rv on rv.user_id = sc.user_id
    limit 200
  ) r;
  return result;
end $$;
