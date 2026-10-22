-- Dispute evidence: photos and PDFs on dispute messages.
--
--   storage bucket "dispute-evidence" (private, 10 MB, images + PDF), path
--   "<dispute_id>/<uuid>-<name>". Parties (and admins) can upload while the
--   dispute is live and read any time; nobody can overwrite or delete, so
--   evidence stays as it was submitted.
--   booking_dispute_messages.attachment_paths (max 4) — add_dispute_message
--   only accepts files in that dispute's folder uploaded by the caller.
--
-- Rollback: supabase/rollbacks/20261029100000_dispute_evidence.down.sql

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dispute-evidence', 'dispute-evidence', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create or replace function public.dispute_evidence_access(p_dispute text, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.booking_disputes d
    where d.id::text = p_dispute
      and ((select auth.uid()) in (d.customer_user_id, d.vendor_user_id) or public.is_admin())
      and (not p_write or d.status in ('open', 'under_review'))
  );
$$;
revoke execute on function public.dispute_evidence_access(text, boolean) from public, anon;
grant execute on function public.dispute_evidence_access(text, boolean) to authenticated;

drop policy if exists dispute_evidence_insert on storage.objects;
create policy dispute_evidence_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dispute-evidence' and public.dispute_evidence_access((storage.foldername(name))[1], true));

drop policy if exists dispute_evidence_read on storage.objects;
create policy dispute_evidence_read on storage.objects
  for select to authenticated
  using (bucket_id = 'dispute-evidence' and public.dispute_evidence_access((storage.foldername(name))[1], false));

alter table public.booking_dispute_messages add column if not exists attachment_paths text[] not null default '{}';
alter table public.booking_dispute_messages drop constraint if exists booking_dispute_messages_body_check;
alter table public.booking_dispute_messages drop constraint if exists booking_dispute_messages_content_check;
alter table public.booking_dispute_messages
  add constraint booking_dispute_messages_content_check check (
    char_length(body) <= 4000 and cardinality(attachment_paths) <= 4
    and (char_length(body) > 0 or cardinality(attachment_paths) > 0)
  );

drop function if exists public.add_dispute_message(uuid, text);
create or replace function public.add_dispute_message(p_dispute_id uuid, p_body text, p_attachments text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  d record;
  role text;
  new_id uuid;
  p text;
  files text[] := coalesce(p_attachments, '{}');
begin
  select * into d from public.booking_disputes where id = p_dispute_id;
  if not found then raise exception 'Dispute not found.' using errcode = 'P0001'; end if;
  role := case when me = d.customer_user_id then 'customer' when me = d.vendor_user_id then 'vendor'
               when public.is_admin() then 'admin' end;
  if role is null then raise exception 'Dispute not found.' using errcode = 'P0001'; end if;
  if d.status not in ('open', 'under_review') then raise exception 'This dispute is closed.' using errcode = 'P0001'; end if;
  if char_length(coalesce(trim(p_body), '')) = 0 and cardinality(files) = 0 then
    raise exception 'Write a message or attach a file.' using errcode = '22023';
  end if;
  if cardinality(files) > 4 then raise exception 'Attach up to 4 files per message.' using errcode = '22023'; end if;
  foreach p in array files loop
    if p is null or split_part(p, '/', 1) <> d.id::text or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'dispute-evidence' and o.name = p and o.owner_id = me::text
    ) then
      raise exception 'One of the files isn''t part of this dispute.' using errcode = '22023';
    end if;
  end loop;
  if role <> 'admin' and (select count(*) from public.booking_dispute_messages
                          where author_user_id = me and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages. Please wait a little.' using errcode = 'P0001';
  end if;
  insert into public.booking_dispute_messages (dispute_id, author_user_id, author_role, body, attachment_paths)
  values (d.id, me, role, coalesce(trim(p_body), ''), files) returning id into new_id;
  update public.booking_disputes set updated_at = now() where id = d.id;
  return new_id;
end $$;
revoke execute on function public.add_dispute_message(uuid, text, text[]) from public, anon;
grant execute on function public.add_dispute_message(uuid, text, text[]) to authenticated;
