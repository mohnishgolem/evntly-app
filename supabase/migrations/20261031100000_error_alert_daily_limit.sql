-- One error-alert email per error per day, decided in the database.
-- recordError used to check for a recent event and then insert, so errors
-- arriving together each sent an email (21 Oct: Resend refused 14 at its
-- 10/second limit). Alerts share the Resend account with auth emails, so a
-- daily cap also stops an error storm from using up the sending allowance.
-- Days are Sydney calendar days. Written only by the service role.

create table if not exists public.error_alerts (
  fingerprint text not null,
  alert_day date not null,
  created_at timestamptz not null default now(),
  primary key (fingerprint, alert_day)
);

alter table public.error_alerts enable row level security;
revoke all on public.error_alerts from anon, authenticated;

-- True only for the first call per fingerprint per day, and only while the
-- day's total is under p_daily_cap. The lock makes the cap exact under
-- concurrent calls; it's held for one short insert.
create or replace function public.claim_error_alert(p_fingerprint text, p_daily_cap integer default 20)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_day date := (now() at time zone 'Australia/Sydney')::date;
begin
  perform pg_advisory_xact_lock(hashtext('public.claim_error_alert'));
  if (select count(*) from public.error_alerts where alert_day = v_day) >= p_daily_cap then
    return false;
  end if;
  insert into public.error_alerts (fingerprint, alert_day)
  values (p_fingerprint, v_day)
  on conflict do nothing;
  return found;
end;
$$;

revoke execute on function public.claim_error_alert(text, integer) from public, anon, authenticated;
grant execute on function public.claim_error_alert(text, integer) to service_role;

select cron.schedule(
  'prune-error-alerts',
  '27 3 * * *',
  $$delete from public.error_alerts where alert_day < current_date - 30$$
);
