declare
  res text[] := '{}';
  v_vendor uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  p text[] := '{}';
  pid text;
  v_event text; v_other_event text;
  q1 text; q2 text; q text;
  n int; s int;
  d date := current_date + 40;
  cv text := json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'm2-vendor@example.invalid')::text;
  cc text := json_build_object('sub', v_cust, 'role', 'authenticated', 'email', 'm2-cust@example.invalid')::text;
  co text := json_build_object('sub', v_other, 'role', 'authenticated', 'email', 'm2-other@example.invalid')::text;
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (v_vendor, 'm2-vendor@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (v_cust,   'm2-cust@example.invalid',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (v_other,  'm2-other@example.invalid',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  for i in 1..7 loop
    insert into public.service_providers (name, service_type, hourly_rate, status, owner_email, owner_user_id, available, is_demo)
    values ('M2 Photo ' || i, 'photographer', 200, 'approved', 'm2-vendor@example.invalid', v_vendor, true, false)
    returning id into pid;
    p := p || pid;
  end loop;
  insert into public.events (organiser_email, organiser_user_id, event_type, event_date, suburb, guest_count, budget_total, required_services, status)
  values ('m2-cust@example.invalid', v_cust, 'Birthday', d, 'Parramatta', 'Under 80', 1000, '{photographer}', 'planning') returning id into v_event;
  insert into public.events (organiser_email, organiser_user_id, event_type, event_date, suburb, guest_count, budget_total, required_services, status)
  values ('m2-other@example.invalid', v_other, 'Wedding', d, 'Bondi', 'Under 80', 5000, '{photographer}', 'planning') returning id into v_other_event;

  -- 1. Can't hang a request on someone else's event.
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status, event_id)
    values (p[1], 'm2-cust@example.invalid', d, 'Wedding', 'Bondi', 50, '$1,000', 'pending', v_other_event);
    res := res || 'FAIL 1 request attached to another customer''s event'::text;
  exception when others then res := res || ('ok 1 other people''s events refused: ' || sqlerrm);
  end;
  reset role;

  -- 2. Client-set match score and quote fields are wiped on insert.
  perform set_config('request.jwt.claims', cc, true); set local role authenticated;
  insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status, event_id,
    match_score, match_reason, deposit_cents, inclusions, quoted_amount)
  values (p[1], 'm2-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'quoted', v_event, 99, 'trust me', 1, '{free}', 1)
  returning id into q1;
  reset role;
  select count(*) into n from public.quote_requests where id = q1 and match_score is null and match_reason is null
    and deposit_cents is null and inclusions = '{}' and quoted_amount is null and status = 'pending';
  res := res || (case when n = 1 then 'ok 2 client-set score/quote fields wiped' else 'FAIL 2 client fields kept' end);

  -- 3. No second live request to the same vendor for the same event.
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status, event_id)
    values (p[1], 'm2-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending', v_event);
    res := res || 'FAIL 3 duplicate invite accepted'::text;
  exception when unique_violation then res := res || 'ok 3 duplicate invite refused (unique_violation)'::text;
    when others then res := res || ('FAIL 3 wrong error: ' || sqlerrm);
  end;
  reset role;

  -- 4. Five live requests per category; the sixth is refused.
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    for i in 2..5 loop
      insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status, event_id)
      values (p[i], 'm2-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending', v_event);
    end loop;
    res := res || 'ok 4a five live requests allowed'::text;
  exception when others then res := res || ('FAIL 4a: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status, event_id)
    values (p[6], 'm2-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending', v_event);
    res := res || 'FAIL 4b sixth request accepted'::text;
  exception when others then res := res || ('ok 4b sixth refused: ' || sqlerrm);
  end;
  reset role;

  -- 5. Customer can't set a match score; the server (service role) can.
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    update public.quote_requests set match_score = 100 where id = q1;
    res := res || 'FAIL 5a customer set match_score'::text;
  exception when others then res := res || ('ok 5a customer cannot score: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true); set local role service_role;
    update public.quote_requests set match_score = 87, match_reason = 'Covers Parramatta', origin = 'smart_match' where id = q1;
    get diagnostics n = row_count;
    res := res || (case when n = 1 then 'ok 5b server set score' else 'FAIL 5b rows ' || n end);
  exception when others then res := res || ('FAIL 5b: ' || sqlerrm);
  end;
  reset role;

  -- 6. Vendor sends a structured quote; deposit can't exceed the total.
  begin
    perform set_config('request.jwt.claims', cv, true); set local role authenticated;
    update public.quote_requests set deposit_cents = 200000, quoted_amount = 900, status = 'quoted' where id = q1;
    res := res || 'FAIL 6a deposit over total accepted'::text;
  exception when others then res := res || ('ok 6a deposit capped at total: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', cv, true); set local role authenticated;
    update public.quote_requests set status = 'quoted', quoted_amount = 900, coverage_hours = 4, travel_fee_cents = 5000,
      inclusions = '{"Edited gallery","Online delivery"}', delivery_days = 14, deposit_cents = 27000,
      cancellation_terms = 'Full refund 30+ days out', service_description = '4 hours of coverage'
    where id = q1;
    res := res || 'ok 6b structured quote sent'::text;
  exception when others then res := res || ('FAIL 6b: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    update public.quote_requests set inclusions = '{"Free drone"}' where id = q1;
    res := res || 'FAIL 6c customer edited inclusions'::text;
  exception when others then res := res || ('ok 6c customer cannot edit quote: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', cv, true); set local role authenticated;
    update public.quote_requests set match_score = 100 where id = q1;
    res := res || 'FAIL 6d vendor set own score'::text;
  exception when others then res := res || 'ok 6d vendor cannot score'::text;
  end;
  reset role;
  select count(*) into n from public.quote_requests where id = q1 and status = 'quoted' and match_score = 87;
  res := res || (case when n = 1 then 'ok 6e state intact (quoted, score 87)' else 'FAIL 6e state' end);

  -- 7. Accept, then the quote is frozen.
  perform set_config('request.jwt.claims', cc, true); set local role authenticated;
  perform public.accept_quote(q1);
  reset role;
  begin
    perform set_config('request.jwt.claims', cv, true); set local role authenticated;
    update public.quote_requests set quoted_amount = 5000 where id = q1;
    res := res || 'FAIL 7 vendor changed an accepted quote'::text;
  exception when others then res := res || ('ok 7 accepted quote frozen: ' || sqlerrm);
  end;
  reset role;
  select count(*) into n from public.bookings b join public.quote_requests r on r.booking_id = b.id where r.id = q1 and b.total_price = 900;
  res := res || (case when n = 1 then 'ok 7b booking at the quoted $900' else 'FAIL 7b booking' end);

  -- 8. A declined vendor can be invited again (only live requests are unique),
  --    and accepting freed a slot under the cap.
  perform set_config('request.jwt.claims', cv, true); set local role authenticated;
  update public.quote_requests set status = 'declined' where event_id = v_event and vendor_id = p[2];
  reset role;
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status, event_id)
    values (p[2], 'm2-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending', v_event) returning id into q2;
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status, event_id)
    values (p[6], 'm2-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending', v_event);
    res := res || 'ok 8 re-invite after decline + slot freed by acceptance'::text;
  exception when others then res := res || ('FAIL 8: ' || sqlerrm);
  end;
  reset role;

  -- 9. The expiry job (not a user) can still expire requests.
  update public.quote_requests set expires_at = now() - interval '1 minute' where id = q2;
  begin
    update public.quote_requests set status = 'expired' where id = q2;
    res := res || 'ok 9 expiry job still works'::text;
  exception when others then res := res || ('FAIL 9: ' || sqlerrm);
  end;

  -- 10. Requests without an event (vendor profile) are unaffected by the cap.
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status)
    values (p[7], 'm2-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending');
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status)
    values (p[7], 'm2-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending');
    res := res || 'ok 10 profile requests (no event) unaffected'::text;
  exception when others then res := res || ('FAIL 10: ' || sqlerrm);
  end;
  reset role;

  -- 11. Outsider sees none of it; vendor sees score but not customer email.
  perform set_config('request.jwt.claims', co, true); set local role authenticated;
  select count(*) into n from public.quote_requests where event_id = v_event;
  reset role;
  res := res || (case when n = 0 then 'ok 11a outsider sees 0' else 'FAIL 11a outsider sees ' || n end);
  perform set_config('request.jwt.claims', cv, true); set local role authenticated;
  select match_score into s from public.quote_requests where id = q1;
  reset role;
  res := res || (case when s = 87 then 'ok 11b vendor reads match score' else 'FAIL 11b ' || coalesce(s::text, 'null') end);
  begin
    perform set_config('request.jwt.claims', cv, true); set local role authenticated;
    perform client_email from public.quote_requests where id = q1;
    res := res || 'FAIL 11c vendor read client_email'::text;
  exception when others then res := res || 'ok 11c client_email still hidden'::text;
  end;
  reset role;

  raise exception 'TEST RESULTS (rolled back)%', E'\n' || array_to_string(res, E'\n');
end
