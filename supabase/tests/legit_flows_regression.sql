-- Legitimate-flow regression suite: the normal marketplace journeys must keep
-- working under the security guards. Same rules as security_regression.sql —
-- branch/local only, synthetic users, final RAISE rolls everything back, and
-- every line of the report must start with PASS.

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
  admin uuid; vendor uuid; vendor2 uuid; customer uuid;
  v_listing text; v2_listing text; new_listing text; ev_id text; el_id text; app_id text; pkg_id text;
  r text; n int; ok boolean; res jsonb;
begin
  admin    := pg_temp.new_user('lf-admin@example.invalid',    '{"full_name":"Admin"}');
  vendor   := pg_temp.new_user('lf-vendor@example.invalid',   '{"role":"vendor","full_name":"Vendor"}');
  vendor2  := pg_temp.new_user('lf-vendor2@example.invalid',  '{"role":"vendor","full_name":"Vendor Two"}');
  customer := pg_temp.new_user('lf-customer@example.invalid', '{"full_name":"Customer"}');
  -- Fixture: granting admin needs the lockdown paused even for the DB owner.
  alter table public.users disable trigger trg_users_lockdown;
  update public.users set role = 'admin' where id = admin::text;
  alter table public.users enable trigger trg_users_lockdown;

  insert into public.service_providers (name, owner_email, service_type, hourly_rate, status)
  values ('LF Vendor', 'lf-vendor@example.invalid', 'dj', 100, 'approved') returning id into v_listing;
  insert into public.service_providers (name, owner_email, service_type, hourly_rate, status)
  values ('LF Vendor Two', 'lf-vendor2@example.invalid', 'photographer', 150, 'approved') returning id into v2_listing;

  -- F1: a new vendor signs up a listing, then edits their bio and rate
  perform pg_temp.act_as(customer);
  begin
    insert into public.service_providers (name, owner_email, service_type, hourly_rate, status, available)
    values ('LF New', 'lf-customer@example.invalid', 'florist', 80, 'pending_review', true) returning id into new_listing;
    update public.service_providers set bio = 'Fresh flowers', hourly_rate = 90 where id = new_listing;
    update public.users set role = 'vendor' where id = customer::text;
    out := out || E'\nPASS F1 vendor signup + listing edit + customer->vendor role';
  exception when others then out := out || E'\nFAIL F1 vendor signup/edit: ' || sqlerrm;
  end;

  -- F2: admin approves it (and it is audited)
  perform pg_temp.act_as(admin);
  begin
    update public.service_providers set status = 'approved' where id = new_listing;
    get diagnostics n = row_count;
    out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' F2 admin approves listing -> rows ' || n;
  exception when others then out := out || E'\nFAIL F2 admin approve: ' || sqlerrm;
  end;
  perform pg_temp.act_as(null);
  select count(*) into n from public.admin_audit_log where target_id = new_listing and actor_user_id = admin;
  out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' F2b approval audited with admin as actor -> ' || n;

  -- F3: vendor adds a portfolio photo to their own listing
  perform pg_temp.act_as(vendor);
  begin
    insert into public.portfolio_items (provider_id, owner_email, media_type, media_url, caption)
    values (v_listing, 'lf-vendor@example.invalid', 'image', 'https://example.supabase.co/storage/v1/object/public/portfolio/x.png', 'Set');
    out := out || E'\nPASS F3 portfolio upload to own listing';
  exception when others then out := out || E'\nFAIL F3 portfolio: ' || sqlerrm;
  end;

  -- F4: customer messages a vendor, vendor replies; customer reports a vendor
  perform pg_temp.act_as(customer);
  begin
    insert into public.messages (conversation_id, sender_email, provider_id, content, customer_initiated)
    values (v_listing || ':' || customer::text, 'lf-customer@example.invalid', v_listing, 'Hi, are you free in May?', true);
    perform pg_temp.act_as(vendor);
    insert into public.messages (conversation_id, sender_email, provider_id, content, customer_initiated)
    values (v_listing || ':' || customer::text, 'lf-vendor@example.invalid', v_listing, 'Yes we are!', true);
    perform pg_temp.act_as(customer);
    insert into public.reports (content_type, content_id, reporter_email, reason, status)
    values ('vendor', v2_listing, 'lf-customer@example.invalid', 'Spam', 'pending');
    out := out || E'\nPASS F4 messaging both ways + report';
  exception when others then out := out || E'\nFAIL F4 messaging/report: ' || sqlerrm;
  end;

  -- F5: event feed — organiser posts, vendor applies (status forced pending), organiser accepts -> booking
  perform pg_temp.act_as(null);
  insert into public.events (organiser_email, event_type, event_date, suburb, guest_count, budget_total, required_services, status)
  values ('lf-customer@example.invalid', 'Wedding', current_date + 90, 'Bondi', '100', 5000, array['dj'], 'planning') returning id into ev_id;
  insert into public.event_listings (event_date, event_type, required_services, source_event_id, status, suburb)
  values (current_date + 90, 'Wedding', array['dj'], ev_id, 'open', 'Bondi') returning id into el_id;
  perform pg_temp.act_as(vendor);
  begin
    insert into public.event_applications (listing_id, quoted_amount, service_type, status, vendor_email, vendor_id, pitch)
    values (el_id, 1500, 'dj', 'accepted', 'lf-vendor@example.invalid', v_listing, 'Happy to help') returning id into app_id;
    perform pg_temp.act_as(null);
    select status into r from public.event_applications where id = app_id;
    out := out || E'\n' || case when r = 'pending' then 'PASS' else 'FAIL' end || ' A11 application status forced to pending -> ' || r;
    perform pg_temp.act_as(customer);
    res := public.accept_event_application(app_id);
    perform pg_temp.act_as(null);
    select count(*) into n from public.bookings where id = res ->> 'booking_id' and total_price = 1500;
    out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' F5 accept_event_application creates booking';
  exception when others then out := out || E'\nFAIL F5 event feed: ' || sqlerrm;
  end;

  -- F6: two vendors build a bundle; customer books it via book_bundle
  perform pg_temp.act_as(vendor);
  begin
    insert into public.combined_packages (name, initiating_vendor_id, initiating_vendor_email, initiating_vendor_name, status, total_price, bundle_discount_amount, participant_emails)
    values ('LF Bundle', v_listing, 'lf-vendor@example.invalid', 'LF Vendor', 'pending', 2000, 100, array['lf-vendor@example.invalid', 'lf-vendor2@example.invalid'])
    returning id into pkg_id;
    insert into public.combined_package_participants (combined_package_id, combined_package_name, initiating_vendor_email, vendor_email, vendor_name, component_price, proposed_by_email, is_initiator, acceptance_status)
    values (pkg_id, 'LF Bundle', 'lf-vendor@example.invalid', 'lf-vendor@example.invalid', 'LF Vendor', 800, 'lf-vendor@example.invalid', true, 'accepted'),
           (pkg_id, 'LF Bundle', 'lf-vendor@example.invalid', 'lf-vendor2@example.invalid', 'LF Vendor Two', 1200, 'lf-vendor@example.invalid', false, 'pending');
    perform pg_temp.act_as(vendor2);
    update public.combined_package_participants set acceptance_status = 'accepted'
    where combined_package_id = pkg_id and vendor_user_id = vendor2;
    perform pg_temp.act_as(customer);
    r := public.book_bundle(pkg_id, current_date + 120, '18:00', 'Bondi Pavilion', '');
    perform pg_temp.act_as(null);
    select count(*) into n from public.bundle_bookings where id = r and total_amount = 1900;
    out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' F6 bundle activates and book_bundle creates booking at 2000-100';
    select count(*) into n from public.group_chat_threads where bundle_booking_id = r;
    out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' F6b bundle group chat created';
  exception when others then out := out || E'\nFAIL F6 bundle flow: ' || sqlerrm;
  end;

  -- F7: rate limiter (as the service role used by server actions)
  perform pg_temp.act_as(null);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
  begin
    r := '';
    for n in 1..3 loop
      ok := public.check_rate_limit('lf-test-key', 2, 60);
      r := r || ok::text || ',';
    end loop;
    out := out || E'\n' || case when r = 'true,true,false,' then 'PASS' else 'FAIL' end || ' F7 rate limit allows 2 then blocks -> ' || r;
  exception when others then out := out || E'\nFAIL F7 rate limit: ' || sqlerrm;
  end;
  perform pg_temp.act_as(null);

  raise exception 'LEGIT FLOW RESULTS (rolled back):%', out;
end $$;
