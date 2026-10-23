-- End-to-end booking flow, run against the real database and always rolled
-- back (the block ends by raising its results as an exception, so nothing it
-- writes is kept and no app emails are sent). Uses existing test accounts:
-- a customer, a vendor with a photographer listing, and an unrelated
-- customer as the "outsider". Run with the Supabase SQL editor or MCP.
--
-- Flow: search photographer → request quote → vendor quotes → customer
-- accepts → vendor confirms → both message → visibility checks for the
-- outsider and for anonymous callers.
do $$
declare
  c_id uuid := '76cd762b-46b9-4cff-bcfb-eeca7f626332';   -- test customer
  v_id uuid := '0b21f848-7f29-47b6-abb1-5c069318c4f5';   -- test vendor
  o_id uuid := '21e522dd-2906-4b67-94e9-fa230cb32f6e';   -- unrelated customer
  sp_id text := 'd2dcddb0-22ba-407d-9adc-378d9d821118';  -- vendor's listing
  c_email text; v_email text; o_email text;
  q_id text; b_id text; conv text; n int; s text; ok boolean;
  results jsonb := '[]'::jsonb;
begin
  select email into c_email from auth.users where id = c_id;
  select email into v_email from auth.users where id = v_id;
  select email into o_email from auth.users where id = o_id;
  conv := sp_id || ':' || c_id::text;

  -- Fixture: the QA listing is suspended in production; approve it here only.
  update public.service_providers set status = 'approved', available = true where id = sp_id;

  -- 1. Customer finds the photographer.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated', 'email', c_email, 'aal', 'aal1')::text, true);
  select count(*) into n from public.service_providers where id = sp_id and status = 'approved' and service_type = 'photographer';
  results := results || jsonb_build_object('step', '1 customer search finds photographer', 'pass', n = 1);

  -- 2. Customer requests a quote.
  insert into public.quote_requests (vendor_id, client_email, client_name, event_date, event_type, location,
      estimated_guests, budget_range, status, origin)
    values (sp_id, c_email, 'E2E Customer', (now() at time zone 'Australia/Sydney')::date + 45, 'Wedding', 'Bondi',
      80, '$1,000–2,000', 'pending', 'vendor_profile')
    returning id into q_id;
  select vendor_user_id = v_id into ok from public.quote_requests where id = q_id;
  results := results || jsonb_build_object('step', '2 quote request created and routed to vendor', 'pass', coalesce(ok, false));

  -- 3. Outsider can't see or change it.
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated', 'email', o_email, 'aal', 'aal1')::text, true);
  select count(*) into n from public.quote_requests where id = q_id;
  results := results || jsonb_build_object('step', '3a outsider cannot read the quote', 'pass', n = 0);
  update public.quote_requests set status = 'declined' where id = q_id;
  get diagnostics n = row_count;
  results := results || jsonb_build_object('step', '3b outsider cannot change the quote', 'pass', n = 0);

  -- 4. Vendor sends a price.
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated', 'email', v_email, 'aal', 'aal1')::text, true);
  select count(*) into n from public.my_quote_requests('vendor') q where q.id = q_id;
  results := results || jsonb_build_object('step', '4a vendor sees the request', 'pass', n = 1);
  update public.quote_requests set status = 'quoted', quoted_amount = 1500 where id = q_id;
  get diagnostics n = row_count;
  results := results || jsonb_build_object('step', '4b vendor quotes $1,500', 'pass', n = 1);

  -- 5. Outsider can't accept someone else's quote.
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated', 'email', o_email, 'aal', 'aal1')::text, true);
  begin
    perform public.accept_quote(q_id);
    ok := false;
  exception when others then ok := true;
  end;
  results := results || jsonb_build_object('step', '5 outsider cannot accept the quote', 'pass', ok);

  -- 6. Customer accepts → booking.
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated', 'email', c_email, 'aal', 'aal1')::text, true);
  b_id := public.accept_quote(q_id);
  select status into s from public.bookings where id = b_id;
  results := results || jsonb_build_object('step', '6 customer accepts, booking created', 'pass', s = 'pending', 'booking_status', s);

  -- 7. Customer messages the vendor.
  insert into public.messages (conversation_id, sender_email, provider_id, content, customer_initiated)
    values (conv, c_email, sp_id, 'Looking forward to it. Can you arrive at 2pm?', true);
  results := results || jsonb_build_object('step', '7 customer sends a message', 'pass', true);

  -- 8. Vendor confirms the booking, reads and replies.
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated', 'email', v_email, 'aal', 'aal1')::text, true);
  update public.bookings set status = 'confirmed' where id = b_id and provider_owner_user_id = v_id;
  get diagnostics n = row_count;
  results := results || jsonb_build_object('step', '8a vendor confirms the booking', 'pass', n = 1);
  select count(*) into n from public.conversation_messages(conv);
  results := results || jsonb_build_object('step', '8b vendor sees the message', 'pass', n = 1);
  insert into public.messages (conversation_id, sender_email, provider_id, content, customer_initiated)
    values (conv, v_email, sp_id, '2pm works, see you then.', false);
  results := results || jsonb_build_object('step', '8c vendor replies', 'pass', true);
  select count(*) into n from public.bookings where id = b_id;
  results := results || jsonb_build_object('step', '8d vendor sees the booking', 'pass', n = 1);

  -- 9. Customer sees the confirmed booking and the reply.
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated', 'email', c_email, 'aal', 'aal1')::text, true);
  select status into s from public.bookings where id = b_id;
  results := results || jsonb_build_object('step', '9a customer sees booking confirmed', 'pass', s = 'confirmed');
  select count(*) into n from public.conversation_messages(conv);
  results := results || jsonb_build_object('step', '9b customer sees both messages', 'pass', n = 2);

  -- 10. Outsider: no booking, no messages, no writes.
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated', 'email', o_email, 'aal', 'aal1')::text, true);
  select count(*) into n from public.bookings where id = b_id;
  results := results || jsonb_build_object('step', '10a outsider cannot read the booking', 'pass', n = 0);
  update public.bookings set status = 'cancelled' where id = b_id;
  get diagnostics n = row_count;
  results := results || jsonb_build_object('step', '10b outsider cannot cancel the booking', 'pass', n = 0);
  select count(*) into n from public.conversation_messages(conv);
  results := results || jsonb_build_object('step', '10c outsider cannot read the messages', 'pass', n = 0);
  select count(*) into n from public.messages where conversation_id = conv;
  results := results || jsonb_build_object('step', '10d outsider cannot read messages table', 'pass', n = 0);
  begin
    insert into public.messages (conversation_id, sender_email, provider_id, content, customer_initiated)
      values (conv, o_email, sp_id, 'injected', true);
    ok := false;
  exception when others then ok := true;
  end;
  results := results || jsonb_build_object('step', '10e outsider cannot post into the conversation', 'pass', ok);

  -- 11. Anonymous caller.
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    select count(*) into n from public.bookings where id = b_id;
    ok := n = 0;
  exception when insufficient_privilege then ok := true;
  end;
  results := results || jsonb_build_object('step', '11a anonymous cannot read the booking', 'pass', ok);
  begin
    select count(*) into n from public.messages where conversation_id = conv;
    ok := n = 0;
  exception when insufficient_privilege then ok := true;
  end;
  results := results || jsonb_build_object('step', '11b anonymous cannot read the messages', 'pass', ok);

  execute 'reset role';
  raise exception 'E2E_RESULTS %', results;
end $$;
