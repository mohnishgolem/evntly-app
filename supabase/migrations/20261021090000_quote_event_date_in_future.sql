-- A quote request closes at the start of the event day (quote_expiry_for),
-- so a request for today or an earlier date was created already expired and
-- the vendor never had a chance to reply (seen on 18 Oct: four same-day
-- requests). Refuse those at insert; the app also enforces "tomorrow onwards"
-- in the forms and server actions (src/lib/event-dates.ts).

create or replace function public.set_quote_request_expiry()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.event_date is null
       or new.event_date <= (now() at time zone 'Australia/Sydney')::date then
      raise exception 'Pick an event date from tomorrow onwards'
        using errcode = 'check_violation';
    end if;
    new.expires_at := public.quote_expiry_for(now(), new.event_date);
  elsif new.status = 'quoted' and old.status is distinct from 'quoted' then
    new.expires_at := public.quote_expiry_for(now(), new.event_date);
  else
    new.expires_at := old.expires_at;
  end if;
  return new;
end;
$$;
