-- Message attachments are scanned for contact details (OCR for photos, text
-- extraction for PDFs) before the other party can open them. Same rule as
-- message text: contact info is only revealed once there's a booking.
--
--   pending  just sent, scan running (hidden from the recipient pre-booking)
--   clear    nothing found
--   contact  phone/email/social handle found (hidden from the recipient until booked)
--   error    couldn't be scanned (e.g. HEIC) — shown, fails open
--
-- Users can't set or change the status: inserts are forced to 'pending' and
-- only the server (service role) moves it on. Enforced in storage too, so a
-- recipient can't fetch a held-back file directly through the storage API.

alter table public.messages
  add column if not exists attachment_scan text
  check (attachment_scan in ('pending', 'clear', 'contact', 'error'));

grant select (attachment_scan) on public.messages to authenticated;

-- Attachments sent before scanning existed were already delivered.
update public.messages
set attachment_scan = 'clear'
where attachment_file_uri is not null and attachment_scan is null;

create or replace function public.guard_attachment_scan()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if public.is_privileged_writer() then return new; end if;
  if tg_op = 'INSERT' then
    new.attachment_scan := case when new.attachment_file_uri is null then null else 'pending' end;
  elsif new.attachment_scan is distinct from old.attachment_scan
     or new.attachment_file_uri is distinct from old.attachment_file_uri
     or new.attachment_type is distinct from old.attachment_type then
    raise exception 'Not authorized to change attachment details';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_attachment_scan() from public, anon, authenticated;

drop trigger if exists trg_messages_attachment_scan on public.messages;
create trigger trg_messages_attachment_scan
  before insert or update on public.messages
  for each row execute function public.guard_attachment_scan();

-- Can the caller open this attachment? Their own upload, a scanned-clean
-- file, or any file once this vendor/customer pair has a booking (the same
-- "booked" rule my_conversations uses for unmasking text).
create or replace function public.attachment_readable(p_path text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.messages m
    where m.attachment_file_uri = p_path
      and (m.sender_user_id = (select auth.uid())
           or m.recipient_user_id = (select auth.uid()))
      and (
        m.sender_user_id = (select auth.uid())
        or m.attachment_scan in ('clear', 'error')
        or exists (
          select 1 from public.bookings b
          where b.provider_id = m.provider_id
            and b.client_user_id::text = split_part(m.conversation_id, ':', 2)
            and b.status <> 'cancelled'
        )
      )
  );
$$;

revoke execute on function public.attachment_readable(text) from public, anon;
grant execute on function public.attachment_readable(text) to authenticated;

drop policy if exists message_attachments_participant_read on storage.objects;
create policy message_attachments_participant_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.is_conversation_participant(
      (storage.foldername(name))[1] || ':' || (storage.foldername(name))[2]
    )
    and (owner_id = (select auth.uid())::text or public.attachment_readable(name))
  );

-- The thread page needs the scan status to explain held-back files.
drop function if exists public.conversation_messages(text);
create function public.conversation_messages(p_conversation_id text)
returns table (
  id text,
  created_at timestamptz,
  content text,
  read boolean,
  from_me boolean,
  provider_id text,
  customer_initiated boolean,
  attachment_file_uri text,
  attachment_type text,
  attachment_scan text
)
language sql
stable
security definer
set search_path to ''
as $$
  select m.id, m.created_at, m.content, m.read, m.sender_user_id = (select auth.uid()), m.provider_id,
         m.customer_initiated, m.attachment_file_uri, m.attachment_type, m.attachment_scan
  from public.messages m
  where m.conversation_id = p_conversation_id
    and (m.sender_user_id = (select auth.uid()) or m.recipient_user_id = (select auth.uid()))
  order by m.created_at;
$$;

revoke execute on function public.conversation_messages(text) from public, anon;
grant execute on function public.conversation_messages(text) to authenticated;
