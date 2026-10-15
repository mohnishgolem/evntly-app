-- Off-platform payment guard enforced in the database (2026-10-16).
--
-- The app's server actions already block messages that arrange payment
-- outside Evntly (src/lib/payment-guard.ts), but a direct PostgREST insert
-- with the public anon key skipped that check. These patterns are a port of
-- the app's regexes (JS \b → Postgres \y, /i → ~*); both are run against
-- tests/fixtures/payment-guard-cases.json and must agree (34/34 at launch).
-- Message content can't be edited after sending (messages lockdown; group
-- messages have no UPDATE policy), so guarding INSERT covers it.

create or replace function public.payment_guard_category(p_content text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_content ~* '\ycash\y' then 'cash'
    when p_content ~* '\ypay\s*id\y' then 'payid'
    when p_content ~* '\ybank\s*transfer\y|\ydirect\s*deposit\y|\ybsb\y|\yaccount\s*number\y' then 'bank_transfer'
    when p_content ~* '\ycrypto(currency)?\y|\ybitcoin\y|\ybtc\y|\yethereum\y|\yusdt\y|\yusdc\y|\y0x[a-f0-9]{40}\y|\y(bc1|[13])[a-z0-9]{25,39}\y' then 'crypto'
  end;
$$;

-- SECURITY DEFINER so it can call payment_guard_category, whose EXECUTE is
-- revoked from API roles (a revoked function called from an invoker
-- trigger would fail with "permission denied" for every message).
create or replace function public.enforce_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if public.payment_guard_category(new.content) is not null then
    -- Same wording as PAYMENT_GUARD_ERROR in src/lib/payment-guard.ts.
    raise exception 'That message mentions paying outside Evntly (cash, PayID, bank transfer, or crypto). All payments need to go through the app — edit your message and try again.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_payment_guard on public.messages;
create trigger trg_messages_payment_guard before insert on public.messages
  for each row execute function public.enforce_payment_guard();
drop trigger if exists trg_group_chat_messages_payment_guard on public.group_chat_messages;
create trigger trg_group_chat_messages_payment_guard before insert on public.group_chat_messages
  for each row execute function public.enforce_payment_guard();

revoke execute on function public.payment_guard_category(text), public.enforce_payment_guard()
  from public, anon, authenticated;
