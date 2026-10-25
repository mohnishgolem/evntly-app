-- Account suspension (customers and vendors).
--
-- admin_set_account_suspension() — MFA-verified admins only, audit-logged:
--   * public.users.suspended_at / suspension_reason (users can't edit these)
--   * auth.users.banned_until: Supabase Auth refuses sign-in and token refresh
--   * auth.sessions deleted: existing refresh tokens stop working, so a
--     signed-in device is out within the access token's lifetime (≤ 1 hour);
--     the app also shows a "suspended" screen on the next page load
--   * optionally suspends the person's vendor listings
-- Admins can't suspend themselves or another admin (demote first).
--
-- Rollback: supabase/rollbacks/20261029085000_account_suspension.down.sql

alter table public.users add column if not exists suspended_at timestamptz;
alter table public.users add column if not exists suspension_reason text;
alter table public.users drop constraint if exists users_suspension_reason_length;
alter table public.users
  add constraint users_suspension_reason_length check (suspension_reason is null or char_length(suspension_reason) <= 1000);

create or replace function public.enforce_users_lockdown()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    if not (old.role = 'customer' and new.role = 'vendor') then
      raise exception 'Not authorized to change role';
    end if;
  end if;

  if (new.terms_version is distinct from old.terms_version
      or new.terms_accepted_at is distinct from old.terms_accepted_at)
     and not public.is_privileged_writer() then
    raise exception 'Use accept_terms() to accept the Terms';
  end if;

  if (new.suspended_at is distinct from old.suspended_at
      or new.suspension_reason is distinct from old.suspension_reason)
     and not public.is_privileged_writer() then
    raise exception 'Not authorized to change account suspension';
  end if;

  return new;
end;
$function$;

create or replace function public.admin_set_account_suspension(
  p_user_id text, p_suspend boolean, p_reason text default null, p_include_listings boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  uid uuid;
  listings integer := 0;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;
  select id, role, suspended_at into target from public.users where id = p_user_id;
  if not found then raise exception 'Account not found.' using errcode = 'P0001'; end if;
  if p_user_id = auth.uid()::text then raise exception 'You can''t suspend your own account.' using errcode = 'P0001'; end if;
  if target.role = 'admin' then raise exception 'Admins can''t be suspended. Change their role first.' using errcode = 'P0001'; end if;
  uid := p_user_id::uuid;

  if p_suspend then
    if char_length(coalesce(trim(p_reason), '')) < 5 then
      raise exception 'Give a reason (5+ characters) — it''s recorded in the audit log.' using errcode = '22023';
    end if;
    update public.users set suspended_at = now(), suspension_reason = trim(p_reason) where id = p_user_id;
    update auth.users set banned_until = now() + interval '100 years' where id = uid;
    delete from auth.sessions where user_id = uid;
    if p_include_listings then
      update public.service_providers set status = 'suspended'
      where owner_user_id = uid and status in ('approved', 'pending_review');
      get diagnostics listings = row_count;
    end if;
  else
    update public.users set suspended_at = null, suspension_reason = null where id = p_user_id;
    update auth.users set banned_until = null where id = uid;
  end if;

  insert into public.admin_audit_log (actor_user_id, action, target_table, target_id, old_value, new_value)
  values (auth.uid(), case when p_suspend then 'account_suspended' else 'account_unsuspended' end, 'users', p_user_id,
          jsonb_build_object('suspended_at', target.suspended_at),
          jsonb_build_object('suspended', p_suspend, 'reason', left(trim(coalesce(p_reason, '')), 500), 'listings_suspended', listings));
end $$;

revoke execute on function public.admin_set_account_suspension(text, boolean, text, boolean) from public, anon;
grant execute on function public.admin_set_account_suspension(text, boolean, text, boolean) to authenticated;

-- Risk overview: include suspension state.
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
    select sc.user_id, u.email, u.role, u.suspended_at, sc.score,
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
