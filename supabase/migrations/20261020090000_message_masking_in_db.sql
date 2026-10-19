-- Contact details in message text are now masked inside the database, not
-- just in the app: before a vendor/customer pair has a booking, the
-- conversation RPCs return masked text, and users can no longer SELECT the
-- raw messages.content column directly. Same rules as the app's
-- maskContactInfo() (src/lib/contact-reveal.ts); parity is checked with
-- tests/fixtures/contact-mask-cases.json / contact-mask-expected.json.

create or replace function public.mask_contact_info(p text)
returns text
language plpgsql
immutable
set search_path to ''
as $fn$
declare
  masked text := p;
  m text;
  t text;
  hidden constant text := '[hidden until booking confirmed]';
begin
  if p is null then return null; end if;

  -- Phone numbers (longest first so a shorter match can't split a longer one).
  for m in
    select mt from (select distinct (regexp_matches(masked, '\+?\d[\d\s().-]{7,}\d', 'g'))[1] as mt) x
    order by length(mt) desc
  loop
    t := regexp_replace(m, '^\s+|\s+$', '', 'g');
    continue when regexp_replace(m, '\D', '', 'g') !~ '\d{3}.*\d{3}';
    continue when t ~ '^\d{4}-\d{1,2}-\d{1,2}$' or t ~ '^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$';
    continue when t ~ '^\d{2,5}\s?-\s?\d{2,5}$';
    masked := replace(masked, m, hidden);
  end loop;

  -- Email addresses.
  for m in
    select mt from (select distinct (regexp_matches(masked, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', 'g'))[1] as mt) x
    order by length(mt) desc
  loop
    masked := replace(masked, m, hidden);
  end loop;

  -- Social handles and profile links.
  for m in
    select mt from (select distinct (regexp_matches(masked,
      '(?:@[a-zA-Z0-9_.]{3,}|(?:instagram\.com|wa\.me|whatsapp\.com|t\.me|facebook\.com|fb\.com)/[a-zA-Z0-9_.]+)', 'gi'))[1] as mt) x
    order by length(mt) desc
  loop
    masked := replace(masked, m, hidden);
  end loop;

  return masked;
end;
$fn$;

create or replace function public.conversation_is_booked(p_provider_id text, p_conversation_id text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.provider_id = p_provider_id
      and b.client_user_id::text = split_part(p_conversation_id, ':', 2)
      and b.status <> 'cancelled'
  );
$$;

revoke execute on function public.conversation_is_booked(text, text) from public, anon, authenticated;

create or replace function public.conversation_messages(p_conversation_id text)
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
  select m.id, m.created_at,
         case when public.conversation_is_booked(m.provider_id, m.conversation_id)
              then m.content else public.mask_contact_info(m.content) end,
         m.read, m.sender_user_id = (select auth.uid()), m.provider_id,
         m.customer_initiated, m.attachment_file_uri, m.attachment_type, m.attachment_scan
  from public.messages m
  where m.conversation_id = p_conversation_id
    and (m.sender_user_id = (select auth.uid()) or m.recipient_user_id = (select auth.uid()))
  order by m.created_at;
$$;

create or replace function public.my_conversations()
returns table (conversation_id text, provider_id text, last_content text, last_attachment_type text,
               last_at timestamptz, unread_count integer, counterpart_name text, i_am_vendor boolean, booked boolean)
language sql
stable
security definer
set search_path to ''
as $$
  with me as (select auth.uid() as id),
  mine as (select m.* from public.messages m, me where m.sender_user_id = me.id or m.recipient_user_id = me.id),
  latest as (select distinct on (mine.conversation_id) mine.* from mine order by mine.conversation_id, mine.created_at desc),
  convs as (
    select l.conversation_id, l.provider_id, l.content, l.attachment_type, l.created_at,
      (select count(*)::int from mine x where x.conversation_id = l.conversation_id and not x.read and x.recipient_user_id = (select id from me)) as unread,
      case when sp.owner_user_id = (select id from me) then public.short_display_name(cu.raw_user_meta_data ->> 'full_name', cu.email) else coalesce(sp.name, 'Vendor') end as counterpart,
      coalesce(sp.owner_user_id = (select id from me), false) as i_am_vendor,
      exists (select 1 from public.bookings b where b.provider_id = l.provider_id and b.client_user_id = cu.id and b.status <> 'cancelled') as booked
    from latest l
    left join public.service_providers sp on sp.id = l.provider_id
    left join auth.users cu on cu.id::text = split_part(l.conversation_id, ':', 2)
  )
  select conversation_id, provider_id,
         case when booked then content else public.mask_contact_info(content) end,
         attachment_type, created_at, unread, counterpart, i_am_vendor, booked
  from convs
  order by created_at desc;
$$;

-- Raw text is only reachable through the masking RPCs above.
revoke select (content) on public.messages from anon, authenticated;
