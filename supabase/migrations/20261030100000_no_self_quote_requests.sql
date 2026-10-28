-- Vendors can't request a quote from (and so book) their own listing. The
-- app checks this too; the trigger is the backstop for direct API calls.
-- Same function as before plus the owner check.
CREATE OR REPLACE FUNCTION public.fill_quote_request_vendor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record;
begin
  select owner_email, owner_user_id, name, service_type, available, unavailable_dates, weekly_unavailable_days
  into v from public.service_providers where id = new.vendor_id and status = 'approved';
  if v.owner_email is null then raise exception 'This vendor isn''t accepting quote requests.'; end if;
  if v.owner_user_id is not null and v.owner_user_id = auth.uid() then
    raise exception 'This is your own listing, so you can''t book it.';
  end if;
  if public.is_blocked_between_ids(auth.uid(), v.owner_user_id) then raise exception 'You can''t request a quote from this vendor.'; end if;
  if v.available is false then raise exception '% isn''t taking new bookings right now.', v.name; end if;
  if to_char(new.event_date, 'YYYY-MM-DD') = any (coalesce(v.unavailable_dates, '{}'))
     or extract(dow from new.event_date)::int = any (coalesce(v.weekly_unavailable_days, '{}')) then
    raise exception '% isn''t available on that date.', v.name;
  end if;
  new.vendor_email := public.current_email(v.owner_user_id, v.owner_email);
  new.vendor_name := v.name;
  new.service_type := v.service_type;
  return new;
end;
$function$;
