declare
  res text[] := '{}';
  v_vendor uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_provider text;
  v_event text;
  v_quote text;
  v_bk text;
  v_a text; v_b text; v_c text; v_d text; v_e text; v_f text;
  v_pkg uuid;
  n int;
  t timestamptz;
  j jsonb;
  d date := current_date + 40;
begin
  -- Fixtures (as the migration owner; all rolled back).
  insert into auth.users (id, email, aud, role, instance_id) values
    (v_vendor, 'sm-vendor@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (v_cust,   'sm-cust@example.invalid',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (v_other,  'sm-other@example.invalid',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into public.service_providers (name, service_type, hourly_rate, status, owner_email, owner_user_id, latitude, longitude, available, is_demo)
  values ('SM Test Photography', 'photographer', 200, 'approved', 'sm-vendor@example.invalid', v_vendor, -33.81, 151.0, true, false)
  returning id into v_provider;

  -- Bookings for the overlap checks (inserted as owner = the booking flow).
  insert into public.bookings (provider_id, provider_name, provider_owner_email, service_type, event_date, total_price, status, escrow_status, client_email, start_time, end_time)
  values (v_provider, 'SM', 'sm-vendor@example.invalid', 'photographer', d, 900, 'pending', 'unpaid', 'sm-cust@example.invalid', '10:00', '14:00') returning id into v_a;
  insert into public.bookings (provider_id, provider_name, provider_owner_email, service_type, event_date, total_price, status, escrow_status, client_email, start_time, end_time)
  values (v_provider, 'SM', 'sm-vendor@example.invalid', 'photographer', d, 900, 'pending', 'unpaid', 'sm-other@example.invalid', '13:00', '17:00') returning id into v_b;
  insert into public.bookings (provider_id, provider_name, provider_owner_email, service_type, event_date, total_price, status, escrow_status, client_email, start_time, end_time)
  values (v_provider, 'SM', 'sm-vendor@example.invalid', 'photographer', d, 900, 'pending', 'unpaid', 'sm-other@example.invalid', '14:00', '18:00') returning id into v_c;
  insert into public.bookings (provider_id, provider_name, provider_owner_email, service_type, event_date, total_price, status, escrow_status, client_email)
  values (v_provider, 'SM', 'sm-vendor@example.invalid', 'photographer', d, 900, 'pending', 'unpaid', 'sm-other@example.invalid') returning id into v_d;
  insert into public.bookings (provider_id, provider_name, provider_owner_email, service_type, event_date, total_price, status, escrow_status, client_email, start_time, end_time)
  values (v_provider, 'SM', 'sm-vendor@example.invalid', 'photographer', d + 3, 900, 'pending', 'unpaid', 'sm-cust@example.invalid', '22:00', '02:00') returning id into v_e;
  insert into public.bookings (provider_id, provider_name, provider_owner_email, service_type, event_date, total_price, status, escrow_status, client_email, start_time, end_time)
  values (v_provider, 'SM', 'sm-vendor@example.invalid', 'photographer', d + 4, 900, 'pending', 'unpaid', 'sm-other@example.invalid', '01:00', '03:00') returning id into v_f;
  select count(*) into n from public.bookings where id in (v_a, v_b) and provider_owner_user_id = v_vendor;
  res := res || ('info fixture bookings synced to vendor: ' || n);

  -- 1. Vendor confirms 10–14.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.bookings set status = 'confirmed' where id = v_a;
    get diagnostics n = row_count;
    res := res || (case when n = 1 then 'ok 1 vendor confirmed 10:00-14:00' else 'FAIL 1 rows=' || n end);
  exception when others then res := res || ('FAIL 1 confirm rejected: ' || sqlerrm);
  end;
  reset role;

  -- 2. Overlapping 13–17 can't also be confirmed.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.bookings set status = 'confirmed' where id = v_b;
    res := res || 'FAIL 2 overlapping booking confirmed'::text;
  exception when exclusion_violation then res := res || 'ok 2 overlap refused (exclusion_violation)'::text;
    when others then res := res || ('FAIL 2 wrong error: ' || sqlerrm);
  end;
  reset role;

  -- 3. Back-to-back 14–18 is fine ([) ranges).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.bookings set status = 'confirmed' where id = v_c;
    res := res || 'ok 3 back-to-back booking confirmed'::text;
  exception when others then res := res || ('FAIL 3 back-to-back refused: ' || sqlerrm);
  end;
  reset role;

  -- 4. No times = whole day, so it clashes.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.bookings set status = 'confirmed' where id = v_d;
    res := res || 'FAIL 4 untimed booking confirmed on a busy day'::text;
  exception when exclusion_violation then res := res || 'ok 4 untimed booking blocks the whole day'::text;
    when others then res := res || ('FAIL 4 wrong error: ' || sqlerrm);
  end;
  reset role;

  -- 5. Overnight 22:00–02:00 clashes with 01:00–03:00 the next day.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.bookings set status = 'confirmed' where id = v_e;
    update public.bookings set status = 'confirmed' where id = v_f;
    res := res || 'FAIL 5 overnight overlap confirmed'::text;
  exception when exclusion_violation then res := res || 'ok 5 overnight overlap refused'::text;
    when others then res := res || ('FAIL 5 wrong error: ' || sqlerrm);
  end;
  reset role;

  -- 6. Cancelling frees the slot: with 10–14 and 14–18 cancelled, 13–17 fits.
  update public.bookings set status = 'cancelled' where id in (v_a, v_c);
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.bookings set status = 'confirmed' where id = v_b;
    res := res || 'ok 6 slot freed after cancellation'::text;
  exception when others then res := res || ('FAIL 6 still blocked: ' || sqlerrm);
  end;
  reset role;

  -- 7. Parties can't move a booking's times.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.bookings set start_time = '06:00', end_time = '07:00' where id = v_b;
    res := res || 'FAIL 7 vendor moved booking times'::text;
  exception when others then res := res || ('ok 7 booking times locked: ' || sqlerrm);
  end;
  reset role;

  -- 8. Packages: owner can add; others can't; anon sees active only.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    insert into public.vendor_packages (provider_id, name, price_cents, included_hours, inclusions)
    values (v_provider, '4 hour coverage', 85000, 4, array['Edited gallery']) returning id into v_pkg;
    insert into public.vendor_packages (provider_id, name, price_cents, active) values (v_provider, 'Hidden', 10000, false);
    res := res || 'ok 8a owner added packages'::text;
  exception when others then res := res || ('FAIL 8a owner insert: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.vendor_packages (provider_id, name, price_cents) values (v_provider, 'Hijack', 100);
    res := res || 'FAIL 8b outsider added a package'::text;
  exception when others then res := res || ('ok 8b outsider insert refused: ' || sqlerrm);
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.vendor_packages set price_cents = 100 where id = v_pkg;
  get diagnostics n = row_count;
  reset role;
  res := res || (case when n = 0 then 'ok 8c outsider update hit 0 rows' else 'FAIL 8c outsider updated price' end);
  set local role anon;
  select count(*) into n from public.vendor_packages where provider_id = v_provider;
  reset role;
  res := res || (case when n = 1 then 'ok 8d anon sees 1 active package' else 'FAIL 8d anon sees ' || n end);
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.vendor_packages set inclusions = array[repeat('x', 200)] where id = v_pkg;
    res := res || 'FAIL 8e 200-char inclusion accepted'::text;
  exception when others then res := res || ('ok 8e inclusion length enforced: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    insert into public.vendor_packages (provider_id, name, price_cents) select v_provider, 'P' || g, 10000 from generate_series(1, 11) g;
    res := res || 'FAIL 8f 13 packages accepted'::text;
  exception when others then res := res || ('ok 8f package cap: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    insert into public.vendor_packages (provider_id, name, price_cents) values (v_provider, 'Free', 0);
    res := res || 'FAIL 8g $0 package accepted'::text;
  exception when others then res := res || ('ok 8g price floor: ' || sqlerrm);
  end;
  reset role;

  -- 9. Calendar timestamp is the server's clock.
  perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
  set local role authenticated;
  update public.service_providers set availability_confirmed_at = '2099-01-01' where id = v_provider;
  reset role;
  select availability_confirmed_at into t from public.service_providers where id = v_provider;
  res := res || (case when t <= now() + interval '1 minute' then 'ok 9 availability stamp clamped to now' else 'FAIL 9 post-dated to ' || coalesce(t::text, 'null') end);
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.service_providers set travel_fee_cents_per_km = 99999 where id = v_provider;
    res := res || 'FAIL 9b $999/km travel fee accepted'::text;
  exception when others then res := res || ('ok 9b travel fee bounds: ' || sqlerrm);
  end;
  reset role;

  -- 10. Busy slots: signed-in only, no customer data, window capped.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.vendor_busy_slots(d::timestamp, (d + 1)::timestamp) s where s.provider_id = v_provider;
  reset role;
  res := res || (case when n = 1 then 'ok 10a busy slot visible (only the confirmed 13-17)' else 'FAIL 10a busy slots: ' || n end);
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.vendor_busy_slots(d::timestamp, (d + 30)::timestamp);
  reset role;
  res := res || (case when n = 0 then 'ok 10b 30-day window returns nothing' else 'FAIL 10b window not capped' end);
  begin
    set local role anon;
    perform public.vendor_busy_slots(d::timestamp, (d + 1)::timestamp);
    res := res || 'FAIL 10c anon called vendor_busy_slots'::text;
  exception when others then res := res || ('ok 10c anon refused: ' || sqlerrm);
  end;
  reset role;

  -- 11. Event times must come as a pair.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated', 'email', 'sm-cust@example.invalid')::text, true);
    set local role authenticated;
    insert into public.events (organiser_email, event_type, event_date, suburb, guest_count, budget_total, required_services, status, start_time)
    values ('sm-cust@example.invalid', 'Birthday', d + 10, 'Parramatta', 'Under 80', 1000, '{photographer}', 'planning', '18:00');
    res := res || 'FAIL 11 start without end accepted'::text;
  exception when others then res := res || ('ok 11 times pair enforced: ' || sqlerrm);
  end;
  reset role;

  -- 12. Quote → accept copies the event's times onto the booking.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated', 'email', 'sm-cust@example.invalid')::text, true);
    set local role authenticated;
    insert into public.events (organiser_email, event_type, event_date, suburb, guest_count, budget_total, required_services, status, start_time, end_time, category_budgets)
    values ('sm-cust@example.invalid', 'Birthday', d + 10, 'Parramatta', 'Under 80', 1000, '{photographer}', 'planning', '18:00', '22:00', '{"photographer": 100000}')
    returning id into v_event;
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, estimated_hours, budget_range, status, event_id)
    values (v_provider, 'sm-cust@example.invalid', d + 10, 'Birthday', 'Parramatta', 50, 4, '$1,000', 'pending', v_event)
    returning id into v_quote;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'sm-vendor@example.invalid')::text, true);
    set local role authenticated;
    update public.quote_requests set status = 'quoted', quoted_amount = 900 where id = v_quote;
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated', 'email', 'sm-cust@example.invalid')::text, true);
    set local role authenticated;
    v_bk := public.accept_quote(v_quote);
    reset role;
    select count(*) into n from public.bookings where id = v_bk and start_time = '18:00' and end_time = '22:00' and duration_hours = 4;
    res := res || (case when n = 1 then 'ok 12 accept_quote copied 18:00-22:00, 4h' else 'FAIL 12 times not copied' end);
  exception when others then res := res || ('FAIL 12 flow: ' || sqlerrm);
  end;
  reset role;

  -- 13. Settings RPC: signed-in only, no secrets.
  perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated', 'email', 'sm-cust@example.invalid')::text, true);
  set local role authenticated;
  j := public.matching_settings();
  reset role;
  res := res || (case when (j->>'enabled')::boolean and (j->'weights'->>'budget')::int = 25 and j ? 'weights' and not j ? 'cron_secret'
    then 'ok 13 matching_settings ' || j::text else 'FAIL 13 settings ' || coalesce(j::text, 'null') end);
  begin
    set local role anon;
    perform public.matching_settings();
    res := res || 'FAIL 13b anon read settings'::text;
  exception when others then res := res || ('ok 13b anon refused: ' || sqlerrm);
  end;
  reset role;

  -- 14. New public listing columns readable by anon; contact columns still not.
  begin
    set local role anon;
    perform travel_fee_cents_per_km, free_travel_km, min_booking_hours, travels_regional, availability_confirmed_at
      from public.service_providers limit 1;
    res := res || 'ok 14a anon reads new listing columns'::text;
  exception when others then res := res || ('FAIL 14a: ' || sqlerrm);
  end;
  reset role;
  begin
    set local role anon;
    perform owner_email from public.service_providers limit 1;
    res := res || 'FAIL 14b anon read owner_email'::text;
  exception when others then res := res || ('ok 14b contact columns still hidden: ' || sqlerrm);
  end;
  reset role;

  raise exception 'TEST RESULTS (rolled back)%', E'\n' || array_to_string(res, E'\n');
end
