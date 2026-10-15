-- Authorization regression suite. Run on a Supabase BRANCH or local stack
-- (never needed on production): it creates synthetic users/rows only, and the
-- final RAISE rolls the whole transaction back. The error message is the
-- report: every line must start with PASS.
--
--   supabase db reset   # local, applies migrations
--   psql "$DB_URL" -f supabase/tests/security_regression.sql
--
-- Attacks (A*) must be blocked; legitimate flows (L*) must keep working.

create or replace function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('role', 'postgres', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;

create or replace function pg_temp.new_user(email text, meta jsonb) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', email, meta, '{}', now(), now());
  return uid;
end $$;

do $$
declare
  out text := '';
  attacker uuid; vendor uuid; vendor2 uuid; customer uuid;
  v_listing text; v2_listing text; atk_listing text; q_id text; b_id text; pkg_id text; part_id text;
  r text; n int; amt numeric;

begin
  attacker := pg_temp.new_user('rt-attacker@example.invalid', '{"role":"admin","full_name":"Attacker"}');
  vendor   := pg_temp.new_user('rt-vendor@example.invalid',   '{"role":"vendor","full_name":"Vendor"}');
  vendor2  := pg_temp.new_user('rt-vendor2@example.invalid',  '{"role":"vendor","full_name":"Vendor Two"}');
  customer := pg_temp.new_user('rt-customer@example.invalid', '{"full_name":"Customer"}');

  -- A1: signup metadata cannot grant admin
  select role into r from public.users where id = attacker::text;
  out := out || E'\n' || case when r = 'customer' then 'PASS' else 'FAIL' end || ' A1 signup role=admin -> ' || coalesce(r, 'null');
  -- L1: vendor signup still works
  select role into r from public.users where id = vendor::text;
  out := out || E'\n' || case when r = 'vendor' then 'PASS' else 'FAIL' end || ' L1 signup role=vendor -> ' || coalesce(r, 'null');

  -- Fixtures (as postgres): two approved vendor listings.
  insert into public.service_providers (name, owner_email, service_type, hourly_rate, status)
  values ('RT Vendor', 'rt-vendor@example.invalid', 'dj', 100, 'approved') returning id into v_listing;
  insert into public.service_providers (name, owner_email, service_type, hourly_rate, status)
  values ('RT Vendor Two', 'rt-vendor2@example.invalid', 'photographer', 150, 'approved') returning id into v2_listing;

  -- A2: listing inserted as approved + fake ratings is neutralised
  perform pg_temp.act_as(attacker);
  begin
    insert into public.service_providers (name, owner_email, service_type, hourly_rate, status, rating, review_count, verified)
    values ('RT Fake', 'rt-attacker@example.invalid', 'dj', 100, 'approved', 5, 500, true)
    returning id into atk_listing;
  exception when others then atk_listing := null;
  end;
  perform pg_temp.act_as(null);
  select status || '/' || coalesce(review_count, 0) || '/' || coalesce(verified, false) into r
  from public.service_providers where id = atk_listing;
  out := out || E'\n' || case when r = 'pending_review/0/false' then 'PASS' else 'FAIL' end
    || ' A2/L2 new listing forced to pending, no fake stats -> ' || coalesce(r, 'insert failed');

  -- A3: owner cannot edit own rating/verified
  perform pg_temp.act_as(vendor);
  begin
    update public.service_providers set rating = 5, review_count = 999, verified = true where id = v_listing;
    out := out || E'\nFAIL A3 owner changed rating/verified';
  exception when others then out := out || E'\nPASS A3 owner rating/verified edit blocked';
  end;

  -- A4: direct booking insert
  perform pg_temp.act_as(attacker);
  begin
    insert into public.bookings (provider_id, provider_owner_email, service_type, event_date, total_price, status, escrow_status, client_email)
    values (v_listing, 'rt-vendor@example.invalid', 'dj', current_date + 30, 1, 'confirmed', 'released', 'rt-attacker@example.invalid');
    out := out || E'\nFAIL A4 direct confirmed $1 booking inserted';
  exception when others then out := out || E'\nPASS A4 direct booking insert blocked';
  end;

  -- A5: self-quoted price
  begin
    insert into public.quote_requests (client_email, vendor_id, event_date, location, estimated_guests, budget_range, status, quoted_amount)
    values ('rt-attacker@example.invalid', v_listing, current_date + 40, 'Sydney', 10, 'x', 'quoted', 1) returning id into q_id;
    perform public.accept_quote(q_id);
    out := out || E'\nFAIL A5 self-quoted $1 quote accepted';
  exception when others then out := out || E'\nPASS A5 self-quote/accept blocked (' || sqlerrm || ')';
  end;

  -- A6: review without a booking / out-of-range rating
  begin
    insert into public.reviews (provider_id, reviewer_email, rating, comment) values (v_listing, 'rt-attacker@example.invalid', 100, 'x');
    out := out || E'\nFAIL A6 review without booking accepted';
  exception when others then out := out || E'\nPASS A6 review without booking blocked';
  end;

  -- A8: portfolio item on someone else's listing
  begin
    insert into public.portfolio_items (provider_id, owner_email, media_type, media_url)
    values (v_listing, 'rt-attacker@example.invalid', 'image', 'https://example.invalid/x.png');
    out := out || E'\nFAIL A8 portfolio item added to victim listing';
  exception when others then out := out || E'\nPASS A8 foreign portfolio insert blocked';
  end;

  -- A9: job card for arbitrary booking
  begin
    insert into public.job_cards (booking_id, vendor_email, organiser_email, service_type, event_date, status)
    values ('nonexistent', 'rt-vendor@example.invalid', 'rt-attacker@example.invalid', 'dj', current_date, 'confirmed');
    out := out || E'\nFAIL A9 job card inserted';
  exception when others then out := out || E'\nPASS A9 arbitrary job card blocked';
  end;

  -- A10: bundle booking inserted as paid
  begin
    insert into public.bundle_bookings (combined_package_id, customer_email, event_date, status, total_amount, payment_status)
    values ('x', 'rt-attacker@example.invalid', current_date + 5, 'confirmed', 0, 'paid');
    out := out || E'\nFAIL A10 bundle booking inserted';
  exception when others then out := out || E'\nPASS A10 direct bundle booking blocked';
  end;

  -- A12: role escalation by update
  begin
    update public.users set role = 'admin' where id = attacker::text;
    out := out || E'\nFAIL A12 self-promoted to admin';
  exception when others then out := out || E'\nPASS A12 self role->admin blocked';
  end;

  -- A13: rate limiter is not callable by users
  begin
    perform public.check_rate_limit('x', 1, 60);
    out := out || E'\nFAIL A13 check_rate_limit callable by authenticated';
  exception
    when undefined_function then out := out || E'\nFAIL A13 check_rate_limit not deployed';
    when others then out := out || E'\nPASS A13 check_rate_limit not callable by users';
  end;

  -- A7: fake active bundle claiming another vendor accepted
  perform pg_temp.act_as(vendor);
  insert into public.combined_packages (name, initiating_vendor_id, initiating_vendor_email, status, total_price, participant_emails)
  values ('RT Bundle', v_listing, 'rt-vendor@example.invalid', 'active', 1, array['rt-vendor@example.invalid', 'rt-vendor2@example.invalid'])
  returning id into pkg_id;
  insert into public.combined_package_participants (combined_package_id, initiating_vendor_email, vendor_email, vendor_name, component_price, acceptance_status)
  values (pkg_id, 'rt-vendor@example.invalid', 'rt-vendor@example.invalid', 'RT Vendor', 500, 'accepted'),
         (pkg_id, 'rt-vendor@example.invalid', 'rt-vendor2@example.invalid', 'RT Vendor Two', 700, 'accepted');
  perform pg_temp.act_as(null);
  select status into r from public.combined_packages where id = pkg_id;
  out := out || E'\n' || case when r = 'pending' then 'PASS' else 'FAIL' end || ' A7 bundle not live until invitee accepts -> ' || r;
  perform pg_temp.act_as(vendor);
  begin
    update public.combined_packages set status = 'active' where id = pkg_id;
    out := out || E'\nFAIL A7b initiator forced bundle active';
  exception when others then out := out || E'\nPASS A7b initiator cannot force bundle active';
  end;
  -- L5: invitee accepts -> bundle goes live with server-computed total
  perform pg_temp.act_as(vendor2);
  update public.combined_package_participants set acceptance_status = 'accepted'
  where combined_package_id = pkg_id and vendor_user_id = vendor2;
  perform pg_temp.act_as(null);
  select status || '/' || total_price::numeric(12, 0) into r from public.combined_packages where id = pkg_id;
  out := out || E'\n' || case when r = 'active/1200' then 'PASS' else 'FAIL' end || ' L5 bundle activates on acceptance -> ' || r;

  -- L3: normal quote -> vendor quotes -> customer accepts
  perform pg_temp.act_as(customer);
  -- Same shape as the app's requestQuote insert.
  insert into public.quote_requests (client_email, vendor_id, event_date, location, estimated_guests, budget_range, status, origin)
  values ('rt-customer@example.invalid', v_listing, current_date + 60, 'Sydney', 50, '$500-1000', 'pending', 'vendor_profile') returning id into q_id;
  perform pg_temp.act_as(vendor);
  update public.quote_requests set status = 'quoted', quoted_amount = 800 where id = q_id;
  perform pg_temp.act_as(customer);
  b_id := public.accept_quote(q_id);
  perform pg_temp.act_as(null);
  select total_price into amt from public.bookings where id = b_id;
  out := out || E'\n' || case when amt = 800 then 'PASS' else 'FAIL' end || ' L3 quote->accept creates booking at vendor price -> ' || coalesce(amt::text, 'none');

  -- L4: vendor confirms (job card auto-created), completes; customer reviews once
  perform pg_temp.act_as(vendor);
  update public.bookings set status = 'confirmed' where id = b_id;
  update public.bookings set status = 'completed' where id = b_id;
  perform pg_temp.act_as(null);
  select count(*) into n from public.job_cards where booking_id = b_id;
  out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' L4a confirm creates one job card -> ' || n;
  perform pg_temp.act_as(customer);
  begin
    insert into public.reviews (provider_id, booking_id, reviewer_email, rating, comment)
    values (v_listing, b_id, 'rt-customer@example.invalid', 5, 'Great');
    out := out || E'\nPASS L4b review after completed booking';
  exception when others then out := out || E'\nFAIL L4b legit review rejected: ' || sqlerrm;
  end;
  begin
    insert into public.reviews (provider_id, booking_id, reviewer_email, rating, comment)
    values (v_listing, b_id, 'rt-customer@example.invalid', 5, 'Again');
    out := out || E'\nFAIL A6b duplicate review accepted';
  exception when others then out := out || E'\nPASS A6b duplicate review blocked';
  end;
  perform pg_temp.act_as(null);
  select review_count || '/' || rating into r from public.service_providers where id = v_listing;
  out := out || E'\n' || case when r = '1/5' then 'PASS' else 'FAIL' end || ' L4c rating recalculated -> ' || r;

  -- Audit log records admin-relevant changes made by the DB owner too.
  begin
    update public.service_providers set status = 'suspended' where id = v2_listing;
    execute 'select count(*) from public.admin_audit_log where target_id = $1 and action = ''listing_status'''
      into n using v2_listing;
    out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' L6 listing status change audited -> ' || n;
  exception when others then out := out || E'\nFAIL L6 audit log: ' || sqlerrm;
  end;
  begin
    update public.users set role = 'vendor' where id = customer::text;
    execute 'select count(*) from public.admin_audit_log where target_id = $1 and action = ''role_change'''
      into n using customer::text;
    out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' L6b role change audited -> ' || n;
    insert into public.reports (content_type, content_id, reporter_email, reason, status)
    values ('vendor', v_listing, 'rt-customer@example.invalid', 'test', 'pending') returning id into r;
    update public.reports set status = 'actioned' where id = r;
    execute 'select count(*) from public.admin_audit_log where target_id = $1 and action = ''report_status'''
      into n using r;
    out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' L6c report decision audited -> ' || n;
  exception when others then out := out || E'\nFAIL L6b/c audit log: ' || sqlerrm;
  end;

  raise exception 'SECURITY REGRESSION RESULTS (rolled back):%', out;
end $$;
