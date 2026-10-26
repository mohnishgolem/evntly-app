-- Restores the definitions in place before 20261029130000.
drop trigger if exists complete_booking_on_job_confirmed on public.job_cards;
drop function if exists public.complete_booking_on_job_confirmed();
drop function if exists public.conversation_context(text);

create or replace function public.fill_message_recipient()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare me uuid := auth.uid(); vendor record; customer_id uuid; recipient uuid;
begin
  if new.provider_id is null or split_part(new.conversation_id, ':', 1) <> new.provider_id then raise exception 'Invalid conversation.'; end if;
  select owner_user_id, owner_email into vendor from public.service_providers where id = new.provider_id;
  select u.id into customer_id from auth.users u where u.id::text = split_part(new.conversation_id, ':', 2);
  if vendor.owner_email is null or customer_id is null then raise exception 'This vendor isn''t accepting messages.'; end if;
  if me is not null and me = vendor.owner_user_id then recipient := customer_id;
  elsif me is not null and me = customer_id then recipient := vendor.owner_user_id;
  else raise exception 'You don''t have access to this conversation.';
  end if;
  if public.is_blocked_between_ids(me, recipient) then raise exception 'You can''t send messages in this conversation.'; end if;
  new.sender_email := public.current_email(me, new.sender_email);
  new.recipient_email := public.current_email(recipient, vendor.owner_email);
  if new.attachment_file_uri is not null then
    if new.attachment_file_uri not like split_part(new.conversation_id, ':', 1) || '/' || split_part(new.conversation_id, ':', 2) || '/%'
       or new.attachment_file_uri like '%..%' or new.attachment_type is null
       or new.attachment_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf') then
      raise exception 'Invalid attachment.';
    end if;
    new.attachment_thumbnail_uri := null;
  elsif coalesce(btrim(new.content), '') = '' then
    raise exception 'Write a message first.';
  end if;
  new.created_by := me::text;
  return new;
end;
$$;

create or replace function public.enforce_bookings_lockdown()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare actor uuid := auth.uid();
begin
  if is_admin() or is_privileged_writer() then return new; end if;
  if new.total_price is distinct from old.total_price or new.commission_percent is distinct from old.commission_percent
     or new.escrow_status is distinct from old.escrow_status or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.stripe_session_id is distinct from old.stripe_session_id or new.provider_id is distinct from old.provider_id
     or new.provider_owner_email is distinct from old.provider_owner_email or new.client_email is distinct from old.client_email
     or new.event_id is distinct from old.event_id or new.service_type is distinct from old.service_type
     or new.event_date is distinct from old.event_date
     or new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time
     or new.duration_hours is distinct from old.duration_hours then
    raise exception 'Not authorized to change this field on a booking';
  end if;
  if new.status is distinct from old.status then
    if actor = old.provider_owner_user_id then
      if new.status not in ('confirmed', 'completed', 'cancelled') then raise exception 'Invalid status transition for vendor'; end if;
    elsif actor = old.client_user_id then
      if new.status not in ('cancelled') then raise exception 'Invalid status transition for customer'; end if;
    else
      raise exception 'Not authorized to change booking status';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_job_cards_lockdown()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if is_admin() then
    return new;
  end if;
  if new.vendor_email is distinct from old.vendor_email
     or new.organiser_email is distinct from old.organiser_email
     or new.booking_id is distinct from old.booking_id
     or new.provider_id is distinct from old.provider_id then
    raise exception 'Not authorized to change this field on a job card';
  end if;
  return new;
end;
$$;
