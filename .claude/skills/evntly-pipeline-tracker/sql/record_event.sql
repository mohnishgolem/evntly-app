-- Record ONE confirmed real-world event for ONE prospect, applying the same
-- rules as admin_prospect_action(). Only after Sai confirms it happened.
-- Fill the three values at the top. Actions: contacted | follow_up_sent |
-- replied | interested | do_not_contact. Raises on any rule breach, so
-- nothing is half-written.
--
-- 25 Nov 2026: rewritten as a DO block. The earlier version used
-- `case when … then 1 / 0` as a guard, but Postgres folds the constant 1/0
-- while planning, so it raised "division by zero" even when every rule passed.
do $$
declare
  v_id uuid := '00000000-0000-0000-0000-000000000000';   -- prospect id
  v_action text := 'contacted';                          -- see list above
  v_note text := 'IG DM sent by Sai 19 Nov 10:12 (batch ig_1119)';
  p public.vendor_prospects%rowtype;
  v_stage text;
begin
  select * into p from public.vendor_prospects where id = v_id for update;
  if not found then raise exception 'prospect not found'; end if;
  if p.do_not_contact then raise exception 'prospect is do-not-contact'; end if;
  if v_action not in ('contacted', 'follow_up_sent', 'replied', 'interested', 'do_not_contact') then
    raise exception 'unknown action %', v_action;
  end if;
  if v_action = 'contacted' and p.contacted_at is not null then raise exception 'already contacted'; end if;
  if v_action = 'follow_up_sent' and (p.follow_up_count >= 1 or p.replied_at is not null or p.contacted_at is null
                                      or p.contacted_at > now() - interval '7 days') then
    raise exception 'follow-up not allowed (one follow-up, 7+ days after first contact, only without a reply)';
  end if;
  if v_action in ('replied', 'interested') and p.contacted_at is null then raise exception 'never contacted'; end if;

  v_stage := case v_action when 'contacted' then 'contacted' when 'interested' then 'interested' else p.stage end;
  update public.vendor_prospects set
    stage = v_stage,
    contacted_at = case when v_action = 'contacted' then now() else contacted_at end,
    last_contacted_at = case when v_action in ('contacted', 'follow_up_sent') then now() else last_contacted_at end,
    next_follow_up_at = case when v_action = 'contacted' then now() + interval '7 days' else null end,
    follow_up_count = case when v_action = 'follow_up_sent' then 1 else follow_up_count end,
    replied_at = case when v_action in ('replied', 'interested') then coalesce(replied_at, now()) else replied_at end,
    do_not_contact = do_not_contact or v_action = 'do_not_contact',
    do_not_contact_at = case when v_action = 'do_not_contact' then now() else do_not_contact_at end,
    do_not_contact_reason = case when v_action = 'do_not_contact' then left(v_note, 200) else do_not_contact_reason end,
    updated_at = now()
  where id = v_id;
  insert into public.vendor_prospect_events (prospect_id, action, from_stage, to_stage, note)
  values (v_id, v_action, p.stage, v_stage, left(v_note, 300));
end $$;
