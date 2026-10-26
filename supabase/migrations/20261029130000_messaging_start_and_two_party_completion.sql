-- Starting conversations, and two-party booking completion (2026-10-26 live test).
--
-- Messaging: a conversation ("<providerId>:<customerUserId>") only existed
-- once it had a message, and the app needed an existing message to open or
-- reply to one — so after a quote or booking neither side could start a chat.
--   * conversation_context(): what the thread page needs for a conversation
--     with no messages yet (names, booked, whether the caller may write).
--   * fill_message_recipient: the first message of a conversation needs a
--     relationship. Customers can write to an approved listing; vendors only
--     to a customer who requested a quote from them or booked them (before,
--     a vendor could open a conversation with any user id).
--
-- Completion: the vendor could set "completed" at any time — straight from
-- pending, before the event, one tap after "Confirm" in the same spot.
--   * Booking status changes are now limited to real transitions: vendor
--     pending -> confirmed / cancelled, confirmed -> cancelled; customer
--     pending|confirmed -> cancelled. Nobody sets "completed" directly.
--   * Job card steps are enforced: the vendor marks "on the way", then
--     "delivered" (only from the event date, on a confirmed booking); the
--     customer then confirms. Previously either side could write any status.
--   * When the customer confirms the job card, the booking becomes completed.
--
-- Rollback: supabase/rollbacks/20261029130000_messaging_start_and_two_party_completion.down.sql

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create or replace function public.conversation_context(p_conversation_id text)
returns table (provider_id text, provider_name text, counterpart_name text,
               i_am_vendor boolean, booked boolean, can_message boolean)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  me uuid := auth.uid();
  pid text := split_part(p_conversation_id, ':', 1);
  cid text := split_part(p_conversation_id, ':', 2);
  sp record;
  cu record;
  related boolean;
begin
  if me is null or pid = '' or cid = '' or p_conversation_id <> pid || ':' || cid then
    return;
  end if;
  select s.id, s.name, s.owner_user_id, s.status into sp from public.service_providers s where s.id = pid;
  if sp.id is null then return; end if;
  select u.id, u.email, u.raw_user_meta_data ->> 'full_name' as full_name into cu
  from auth.users u where u.id::text = cid;
  if cu.id is null or me not in (sp.owner_user_id, cu.id) then return; end if;

  related := exists (select 1 from public.messages m where m.conversation_id = p_conversation_id)
    or exists (select 1 from public.quote_requests q where q.vendor_id = pid and q.client_user_id = cu.id)
    or exists (select 1 from public.bookings b where b.provider_id = pid and b.client_user_id = cu.id);

  return query select
    pid,
    sp.name,
    case when me = sp.owner_user_id then public.short_display_name(cu.full_name, cu.email)
         else coalesce(sp.name, 'Vendor') end,
    me = sp.owner_user_id,
    exists (select 1 from public.bookings b
            where b.provider_id = pid and b.client_user_id = cu.id and b.status <> 'cancelled'),
    related or (me = cu.id and sp.status = 'approved');
end;
$$;
revoke execute on function public.conversation_context(text) from public, anon;
grant execute on function public.conversation_context(text) to authenticated;

create or replace function public.fill_message_recipient()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare me uuid := auth.uid(); vendor record; customer_id uuid; recipient uuid;
begin
  if new.provider_id is null or split_part(new.conversation_id, ':', 1) <> new.provider_id then raise exception 'Invalid conversation.'; end if;
  select owner_user_id, owner_email, status into vendor from public.service_providers where id = new.provider_id;
  select u.id into customer_id from auth.users u where u.id::text = split_part(new.conversation_id, ':', 2);
  if vendor.owner_email is null or customer_id is null then raise exception 'This vendor isn''t accepting messages.'; end if;
  if me is not null and me = vendor.owner_user_id then recipient := customer_id;
  elsif me is not null and me = customer_id then recipient := vendor.owner_user_id;
  else raise exception 'You don''t have access to this conversation.';
  end if;
  if public.is_blocked_between_ids(me, recipient) then raise exception 'You can''t send messages in this conversation.'; end if;
  -- First message of a conversation: there has to be a reason for it.
  if not exists (select 1 from public.messages m where m.conversation_id = new.conversation_id)
     and not exists (select 1 from public.quote_requests q where q.vendor_id = new.provider_id and q.client_user_id = customer_id)
     and not exists (select 1 from public.bookings b where b.provider_id = new.provider_id and b.client_user_id = customer_id) then
    if me = vendor.owner_user_id then
      raise exception 'You can message a customer once they''ve requested a quote or booked you.';
    elsif vendor.status is distinct from 'approved' then
      raise exception 'This vendor isn''t accepting messages.';
    end if;
  end if;
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

-- ---------------------------------------------------------------------------
-- Booking status transitions
-- ---------------------------------------------------------------------------
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
    if new.status = 'completed' then
      raise exception 'A booking is completed when the customer confirms the job was done.';
    end if;
    if actor = old.provider_owner_user_id then
      if not ((old.status = 'pending' and new.status in ('confirmed', 'cancelled'))
              or (old.status = 'confirmed' and new.status = 'cancelled')) then
        raise exception 'This booking can''t be changed to %.', new.status;
      end if;
    elsif actor = old.client_user_id then
      if not (old.status in ('pending', 'confirmed') and new.status = 'cancelled') then
        raise exception 'This booking can''t be changed to %.', new.status;
      end if;
    else
      raise exception 'Not authorized to change booking status';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job card steps
-- ---------------------------------------------------------------------------
create or replace function public.enforce_job_cards_lockdown()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  actor uuid := auth.uid();
  progress_changed boolean;
  booking_status text;
begin
  if is_admin() or is_privileged_writer() then
    return new;
  end if;
  if new.vendor_email is distinct from old.vendor_email
     or new.organiser_email is distinct from old.organiser_email
     or new.booking_id is distinct from old.booking_id
     or new.provider_id is distinct from old.provider_id
     or new.event_date is distinct from old.event_date then
    raise exception 'Not authorized to change this field on a job card';
  end if;

  progress_changed := new.status is distinct from old.status
    or new.on_my_way is distinct from old.on_my_way or new.on_my_way_at is distinct from old.on_my_way_at
    or new.delivered_at is distinct from old.delivered_at or new.confirmed_at is distinct from old.confirmed_at;
  if not progress_changed then
    return new;
  end if;

  select status into booking_status from bookings where id = old.booking_id;
  if booking_status is distinct from 'confirmed' then
    raise exception 'This booking isn''t confirmed.';
  end if;

  if actor = old.vendor_user_id
     and new.confirmed_at is not distinct from old.confirmed_at then
    if old.status = 'scheduled' and new.status = 'on_the_way'
       and new.delivered_at is not distinct from old.delivered_at then
      return new;
    end if;
    if old.status in ('scheduled', 'on_the_way') and new.status = 'delivered' then
      if old.event_date > (now() at time zone 'Australia/Sydney')::date then
        raise exception 'You can mark the job delivered from the event day.';
      end if;
      return new;
    end if;
  elsif actor = old.organiser_user_id
     and old.status = 'delivered' and new.status = 'confirmed'
     and new.delivered_at is not distinct from old.delivered_at
     and new.on_my_way is not distinct from old.on_my_way
     and new.on_my_way_at is not distinct from old.on_my_way_at then
    return new;
  end if;
  raise exception 'This job card can''t be changed to %.', new.status;
end;
$$;

create or replace function public.complete_booking_on_job_confirmed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    update public.bookings set status = 'completed'
    where id = new.booking_id and status = 'confirmed';
  end if;
  return new;
end;
$$;
revoke execute on function public.complete_booking_on_job_confirmed() from public, anon, authenticated;

drop trigger if exists complete_booking_on_job_confirmed on public.job_cards;
create trigger complete_booking_on_job_confirmed after update of status on public.job_cards
  for each row execute function public.complete_booking_on_job_confirmed();
