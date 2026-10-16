-- Payment guard: log-only until in-app payments launch (Sai, 2026-10-16).
--
-- Evntly has no checkout yet and the Terms tell people to pay vendors
-- directly, so blocking "cash / bank transfer / PayID" messages left
-- customers and vendors with no way to agree on payment. Until Stripe ships
-- the guard only FLAGS those messages in the admin Leak Log (delivered=true);
-- it doesn't stop them.
--
-- The one switch, read by the trigger (and therefore by the app, which just
-- reacts to the trigger's rejection):
--   update public.app_settings set value = 'block' where key = 'payment_guard_mode';

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
-- Server-side configuration only: no API role can read or change it.
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value) values ('payment_guard_mode', 'log')
on conflict (key) do nothing;
alter table public.app_settings drop constraint if exists app_settings_payment_guard_mode_valid;
alter table public.app_settings add constraint app_settings_payment_guard_mode_valid
  check (key <> 'payment_guard_mode' or value in ('log', 'block'));

-- The words that tripped the guard (what the app logs as original_snippet),
-- rather than the whole message.
create or replace function public.payment_guard_snippet(p_content text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (regexp_match(p_content,
    '(\ycash\y|\ypay\s*id\y|\ybank\s*transfer\y|\ydirect\s*deposit\y|\ybsb\y|\yaccount\s*number\y|\ycrypto(?:currency)?\y|\ybitcoin\y|\ybtc\y|\yethereum\y|\yusdt\y|\yusdc\y|\y0x[a-f0-9]{40}\y|\y(?:bc1|[13])[a-z0-9]{25,39}\y)',
    'i'))[1];
$$;

-- Existing Leak Log rows were all blocked (never delivered).
alter table public.leakage_events add column if not exists delivered boolean not null default false;

create or replace function public.enforce_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category text;
  mode text;
begin
  if public.is_admin() or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  category := public.payment_guard_category(new.content);
  if category is null then
    return new;
  end if;

  select value into mode from public.app_settings where key = 'payment_guard_mode';
  if coalesce(mode, 'block') = 'block' then
    -- Same wording as PAYMENT_GUARD_ERROR in src/lib/payment-guard.ts; the
    -- app records the attempt in the Leak Log when it sees this error.
    raise exception 'That message mentions paying outside Evntly (cash, PayID, bank transfer, or crypto). All payments need to go through the app — edit your message and try again.'
      using errcode = 'check_violation';
  end if;

  -- Log-only: deliver the message and flag it for the admin Leak Log. Done
  -- here (not in the app) so direct API inserts are recorded too.
  -- Fields read via jsonb: PL/pgSQL errors on new.thread_id for messages
  -- (and new.conversation_id for group messages) even in an untaken branch.
  insert into public.leakage_events
    (sender_id, sender_email, conversation_id, category, original_snippet, redacted_message, delivered)
  values (
    auth.uid()::text,
    public.current_email(auth.uid(), null),
    coalesce(to_jsonb(new) ->> 'conversation_id', to_jsonb(new) ->> 'thread_id'),
    category,
    public.payment_guard_snippet(new.content),
    null,
    true
  );
  return new;
end;
$$;

revoke execute on function public.enforce_payment_guard(), public.payment_guard_snippet(text)
  from public, anon, authenticated;
