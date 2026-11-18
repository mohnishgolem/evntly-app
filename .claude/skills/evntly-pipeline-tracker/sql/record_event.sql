-- Record ONE confirmed real-world event for ONE prospect, applying the same
-- rules as admin_prospect_action(). Only after Sai confirms it happened.
-- Fill the two values in `args`. Actions: contacted | follow_up_sent |
-- replied | interested | do_not_contact. Runs in one transaction; raises on
-- any rule breach so nothing is half-written.
begin;
with args(prospect_id, action, note) as (
  values ('00000000-0000-0000-0000-000000000000'::uuid, 'contacted', 'IG DM sent by Sai 19 Nov 10:12 (batch ig_1119)')
),
p as (select vp.* from public.vendor_prospects vp join args on vp.id = args.prospect_id for update),
check_rules as (
  select
    case
      when (select count(*) from p) <> 1 then 1 / 0  -- prospect not found
      when (select do_not_contact from p) then 1 / 0  -- never touch do-not-contact
      when (select action from args) = 'contacted' and (select contacted_at from p) is not null then 1 / 0
      when (select action from args) = 'follow_up_sent'
        and ((select follow_up_count from p) >= 1 or (select replied_at from p) is not null
             or (select contacted_at from p) is null or (select contacted_at from p) > now() - interval '7 days') then 1 / 0
      when (select action from args) in ('replied', 'interested') and (select contacted_at from p) is null then 1 / 0
      when (select action from args) not in ('contacted', 'follow_up_sent', 'replied', 'interested', 'do_not_contact') then 1 / 0
      else 1
    end as ok
),
upd as (
  update public.vendor_prospects vp set
    stage = case a.action when 'contacted' then 'contacted' when 'interested' then 'interested' else vp.stage end,
    contacted_at = case when a.action = 'contacted' then now() else vp.contacted_at end,
    last_contacted_at = case when a.action in ('contacted', 'follow_up_sent') then now() else vp.last_contacted_at end,
    next_follow_up_at = case when a.action = 'contacted' then now() + interval '7 days' when a.action = 'follow_up_sent' then null
                             when a.action in ('replied', 'interested', 'do_not_contact') then null else vp.next_follow_up_at end,
    follow_up_count = case when a.action = 'follow_up_sent' then 1 else vp.follow_up_count end,
    replied_at = case when a.action in ('replied', 'interested') then coalesce(vp.replied_at, now()) else vp.replied_at end,
    do_not_contact = vp.do_not_contact or a.action = 'do_not_contact',
    do_not_contact_at = case when a.action = 'do_not_contact' then now() else vp.do_not_contact_at end,
    do_not_contact_reason = case when a.action = 'do_not_contact' then left(a.note, 200) else vp.do_not_contact_reason end,
    updated_at = now()
  from args a, check_rules c
  where vp.id = a.prospect_id and c.ok = 1
  returning vp.id, vp.stage
)
insert into public.vendor_prospect_events (prospect_id, action, from_stage, to_stage, note)
select u.id, a.action, (select stage from p), u.stage, left(a.note, 300) from upd u, args a
returning prospect_id, action, from_stage, to_stage;
commit;
