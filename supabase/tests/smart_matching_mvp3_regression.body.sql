declare
  res text[] := '{}';
  v_vendor uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  pa text; pb text; q text; v_event text;
  n int; t timestamptz; r double precision; h double precision; j jsonb;
  d date := current_date + 40;
  cv text := json_build_object('sub', v_vendor, 'role', 'authenticated', 'email', 'm3-vendor@example.invalid')::text;
  cc text := json_build_object('sub', v_cust, 'role', 'authenticated', 'email', 'm3-cust@example.invalid')::text;
  ca text := json_build_object('sub', v_admin, 'role', 'authenticated', 'email', 'm3-admin@example.invalid', 'aal', 'aal2')::text;
  ca1 text := json_build_object('sub', v_admin, 'role', 'authenticated', 'email', 'm3-admin@example.invalid', 'aal', 'aal1')::text;
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (v_vendor, 'm3-vendor@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (v_cust,   'm3-cust@example.invalid',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (v_admin,  'm3-admin@example.invalid',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  -- Fixture only (rolled back): users.role is otherwise locked against SQL changes.
  alter table public.users disable trigger trg_users_lockdown;
  update public.users set role = 'admin' where id = v_admin::text;
  alter table public.users enable trigger trg_users_lockdown;
  insert into public.service_providers (name, service_type, hourly_rate, status, owner_email, owner_user_id, available, is_demo)
  values ('M3 A', 'photographer', 200, 'approved', 'm3-vendor@example.invalid', v_vendor, true, false) returning id into pa;
  insert into public.service_providers (name, service_type, hourly_rate, status, owner_email, owner_user_id, available, is_demo)
  values ('M3 B', 'photographer', 200, 'approved', 'm3-vendor@example.invalid', v_vendor, true, false) returning id into pb;

  -- 1. responded_at: never from the client, stamped on first answer, immovable.
  perform set_config('request.jwt.claims', cc, true); set local role authenticated;
  insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status, responded_at)
  values (pa, 'm3-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending', '2020-01-01') returning id into q;
  reset role;
  select responded_at into t from public.quote_requests where id = q;
  res := res || (case when t is null then 'ok 1a client-set responded_at ignored' else 'FAIL 1a ' || t end);
  perform set_config('request.jwt.claims', cv, true); set local role authenticated;
  update public.quote_requests set status = 'quoted', quoted_amount = 900 where id = q;
  reset role;
  select responded_at into t from public.quote_requests where id = q;
  res := res || (case when t between now() - interval '1 minute' and now() + interval '1 minute' then 'ok 1b stamped on reply' else 'FAIL 1b ' || coalesce(t::text, 'null') end);
  perform set_config('request.jwt.claims', cv, true); set local role authenticated;
  update public.quote_requests set responded_at = now() - interval '5 days', vendor_note = 'x' where id = q;
  reset role;
  select responded_at into t from public.quote_requests where id = q;
  res := res || (case when t > now() - interval '1 minute' then 'ok 1c vendor cannot backdate responded_at' else 'FAIL 1c moved to ' || t end);

  -- 2. Reliability: 4 decidable (3 answered, 1 unanswered expiry) → 0.75; avg (2+6+1)/3 = 3.0 h.
  delete from public.quote_requests where id = q;
  alter table public.quote_requests disable trigger trg_quote_requests_responded_at;
  alter table public.quote_requests disable trigger trg_quote_requests_set_expiry;
  insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status, quoted_amount, created_at, responded_at, expires_at) values
    (pa, 'm3-cust@example.invalid', d, 'Birthday', 'P', 50, '$1', 'quoted',   900, now() - interval '10 hours', now() - interval '8 hours', now() + interval '5 days'),
    (pa, 'm3-cust@example.invalid', d, 'Birthday', 'P', 50, '$1', 'declined', null, now() - interval '10 hours', now() - interval '4 hours', now() + interval '5 days'),
    (pa, 'm3-cust@example.invalid', d, 'Birthday', 'P', 50, '$1', 'accepted', 800, now() - interval '5 hours', now() - interval '4 hours', now() + interval '5 days'),
    (pa, 'm3-cust@example.invalid', d, 'Birthday', 'P', 50, '$1', 'expired',  null, now() - interval '9 days', null, now() - interval '2 days'),
    (pa, 'm3-cust@example.invalid', d, 'Birthday', 'P', 50, '$1', 'cancelled', null, now() - interval '3 days', null, now() + interval '4 days'),
    (pa, 'm3-cust@example.invalid', d, 'Birthday', 'P', 50, '$1', 'pending',  null, now() - interval '1 hour', null, now() + interval '6 days'),
    (pb, 'm3-cust@example.invalid', d, 'Birthday', 'P', 50, '$1', 'quoted',   900, now() - interval '3 hours', now() - interval '2 hours', now() + interval '5 days'),
    (pb, 'm3-cust@example.invalid', d, 'Birthday', 'P', 50, '$1', 'declined', null, now() - interval '3 hours', now() - interval '2 hours', now() + interval '5 days');
  alter table public.quote_requests enable trigger trg_quote_requests_responded_at;
  alter table public.quote_requests enable trigger trg_quote_requests_set_expiry;
  perform public.refresh_vendor_reliability();
  select acceptance_rate, avg_response_hours into r, h from public.service_providers where id = pa;
  res := res || (case when r = 0.75 and h = 3.0 then 'ok 2a vendor A: 75% replies, 3.0 h' else 'FAIL 2a rate=' || coalesce(r::text,'null') || ' hours=' || coalesce(h::text,'null') end);
  select acceptance_rate, avg_response_hours into r, h from public.service_providers where id = pb;
  res := res || (case when r is null and h is null then 'ok 2b vendor B (2 requests) stays neutral' else 'FAIL 2b ' || coalesce(r::text,'null') end);
  select count(*) into n from cron.job where jobname = 'refresh-vendor-reliability' and schedule = '41 3 * * *';
  res := res || (case when n = 1 then 'ok 2c nightly job scheduled' else 'FAIL 2c' end);
  begin
    perform set_config('request.jwt.claims', cv, true); set local role authenticated;
    perform public.refresh_vendor_reliability();
    res := res || 'FAIL 2d vendor ran refresh'::text;
  exception when others then res := res || 'ok 2d refresh not callable by users'::text;
  end;
  reset role;

  -- 3. Settings: admin (aal2) only, validated, audit-logged.
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    perform public.admin_set_matching_settings(false, '{"suitability":1,"budget":1,"quality":1,"location":1,"reliability":1}');
    res := res || 'FAIL 3a customer changed settings'::text;
  exception when others then res := res || ('ok 3a customer refused: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', ca1, true); set local role authenticated;
    perform public.admin_set_matching_settings(false, '{"suitability":1,"budget":1,"quality":1,"location":1,"reliability":1}');
    res := res || 'FAIL 3b admin without MFA changed settings'::text;
  exception when others then res := res || 'ok 3b admin without MFA (aal1) refused'::text;
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', ca, true); set local role authenticated;
    perform public.admin_set_matching_settings(true, '{"suitability":30,"budget":"lots","quality":20,"location":15,"reliability":10}');
    res := res || 'FAIL 3c junk weight accepted'::text;
  exception when others then res := res || ('ok 3c junk weight refused: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', ca, true); set local role authenticated;
    perform public.admin_set_matching_settings(true, '{"suitability":0,"budget":0,"quality":0,"location":0,"reliability":0}');
    res := res || 'FAIL 3d all-zero weights accepted'::text;
  exception when others then res := res || 'ok 3d all-zero refused'::text;
  end;
  reset role;
  perform set_config('request.jwt.claims', ca, true); set local role authenticated;
  j := public.admin_set_matching_settings(false, '{"suitability":40,"budget":30,"quality":10,"location":10,"reliability":10}');
  reset role;
  res := res || (case when (j->>'enabled')::boolean = false and (j->'weights'->>'suitability')::int = 40 then 'ok 3e admin saved settings' else 'FAIL 3e ' || j::text end);
  select count(*) into n from public.admin_audit_log where actor_user_id = v_admin and action = 'matching_settings'
    and new_value->'weights'->>'budget' = '30' and old_value ? 'weights';
  res := res || (case when n = 1 then 'ok 3f change audit-logged with before/after' else 'FAIL 3f audit rows ' || n end);

  -- 4. Report: admin only, returns every section.
  begin
    perform set_config('request.jwt.claims', cv, true); set local role authenticated;
    perform public.admin_matching_report(30);
    res := res || 'FAIL 4a vendor read report'::text;
  exception when others then res := res || 'ok 4a report refused to non-admins'::text;
  end;
  reset role;
  insert into public.events (organiser_email, organiser_user_id, event_type, event_date, suburb, guest_count, budget_total, required_services, status)
  values ('m3-cust@example.invalid', v_cust, 'Birthday', d, 'Parramatta', 'Under 80', 1000, '{photographer}', 'planning') returning id into v_event;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true); set local role service_role;
  insert into public.match_runs (event_id, service, run_date, suburb, event_date, eligible, unconfirmed, excluded, exclusion_counts)
  values (v_event, 'photographer', current_date, 'Parramatta', d, 0, 0, 14, '{"sample_listing": 14}');
  reset role;
  perform set_config('request.jwt.claims', ca, true); set local role authenticated;
  j := public.admin_matching_report(30);
  reset role;
  res := res || (case when j ?& array['searches','by_service','failures','exclusions','quotes','bookings','vendors']
      and (j->'searches'->>'total')::int >= 1 and (j->'exclusions'->>'sample_listing')::int >= 14
      and jsonb_array_length(j->'failures') >= 1 and (j->'quotes'->>'avg_response_hours') is not null
    then 'ok 4b report: searches ' || (j->'searches')::text || ' quotes ' || (j->'quotes')::text else 'FAIL 4b ' || left(j::text, 300) end);

  -- 5. match_runs is not readable by customers or vendors.
  begin
    perform set_config('request.jwt.claims', cc, true); set local role authenticated;
    select count(*) into n from public.match_runs;
    res := res || ('FAIL 5 customer read match_runs: ' || n);
  exception when others then res := res || ('ok 5 match_runs private: ' || sqlerrm);
  end;
  reset role;

  raise exception 'TEST RESULTS (rolled back)%', E'\n' || array_to_string(res, E'\n');
end
