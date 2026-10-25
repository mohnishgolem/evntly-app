-- Regression for 20261029090000_legal_consents + 20261029090100_legal_enforcement.
-- Run as: <both migrations> ; do $$ <this file> $$;  — the final raise rolls
-- everything back (fixtures and migrations).
declare
  res text[] := '{}';
  v_cust uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_new uuid := gen_random_uuid();
  pa text; q text; rid uuid; rid2 uuid; n int; b boolean; j text;
  d date := current_date + 40;
  cc text := json_build_object('sub', v_cust, 'role', 'authenticated', 'email', 'lc-cust@example.invalid')::text;
  co text := json_build_object('sub', v_other, 'role', 'authenticated', 'email', 'lc-other@example.invalid')::text;
  cn text := json_build_object('sub', v_new, 'role', 'authenticated', 'email', 'lc-new@example.invalid')::text;
begin
  insert into auth.users (id, email, aud, role, instance_id, raw_user_meta_data) values
    (v_cust,  'lc-cust@example.invalid',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
    (v_other, 'lc-other@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'),
    -- Old client path: terms_version in metadata must no longer count.
    (v_new,   'lc-new@example.invalid',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{"terms_version":"2026-10-24"}');
  -- A real, approved vendor listing to request quotes from (fixture inserted as owner).
  select id into pa from public.service_providers where status = 'approved' and coalesce(is_demo, false) = false limit 1;
  if pa is null then
    select id into pa from public.service_providers where status = 'approved' limit 1;
  end if;

  -- 1. Metadata no longer records acceptance.
  select terms_version is null into b from public.users where id = v_new::text;
  res := res || (case when b then 'ok 1 metadata terms_version ignored' else 'FAIL 1 metadata recorded acceptance' end);

  -- 2. Anonymous: versions readable, consents not.
  set local role anon;
  select count(*) into n from public.legal_document_versions;
  res := res || (case when n = 6 then 'ok 2a anon reads versions' else 'FAIL 2a ' || n end);
  begin
    select count(*) into n from public.legal_consents;
    res := res || ('FAIL 2b anon read consents: ' || n);
  exception when others then res := res || 'ok 2b anon denied consents'::text;
  end;
  reset role;

  -- 3. Users can't call the service-role signup recorder or write rows directly.
  perform set_config('request.jwt.claims', cc, true); set local role authenticated;
  begin
    perform public.record_signup_consents(v_cust::text, 'customer', true);
    res := res || 'FAIL 3a user called record_signup_consents'::text;
  exception when others then res := res || 'ok 3a record_signup_consents denied to users'::text;
  end;
  begin
    insert into public.legal_consents (user_id, document, version, status, context)
    values (v_cust::text, 'customer_terms', '2026-10-24', 'accepted', 'signup');
    res := res || 'FAIL 3b direct insert allowed'::text;
  exception when others then res := res || 'ok 3b direct insert denied'::text;
  end;
  -- 4. No acceptance yet → quote request blocked.
  begin
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status)
    values (pa, 'lc-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending');
    res := res || 'FAIL 4 quote without acceptance'::text;
  exception when others then
    res := res || (case when sqlerrm like 'LEGAL_ACCEPTANCE_REQUIRED%' then 'ok 4 quote blocked: ' || sqlerrm else 'FAIL 4 wrong error: ' || sqlerrm end);
  end;
  reset role;

  -- 5. Service role records signup consents (customer, marketing on); fake id ignored.
  perform public.record_signup_consents(v_cust::text, 'customer', true);
  perform public.record_signup_consents(gen_random_uuid()::text, 'customer', true);
  select count(*) into n from public.legal_consents where user_id = v_cust::text;
  res := res || (case when n = 4 then 'ok 5a 3 documents + marketing recorded' else 'FAIL 5a rows=' || n end);
  select count(*) into n from public.legal_consents c where c.context = 'signup' and not exists (select 1 from auth.users u where u.id::text = c.user_id);
  res := res || (case when n = 0 then 'ok 5b no rows for fake ids' else 'FAIL 5b orphan rows=' || n end);
  select status into j from public.legal_consents where user_id = v_cust::text and document = 'privacy_policy';
  res := res || (case when j = 'acknowledged' then 'ok 5c privacy acknowledged (not accepted)' else 'FAIL 5c ' || j end);
  select terms_version into j from public.users where id = v_cust::text;
  res := res || (case when j = '2026-10-24' then 'ok 5d users cache updated' else 'FAIL 5d ' || coalesce(j, 'null') end);

  -- 6. Append-only even for the owner role.
  begin
    update public.legal_consents set version = '2020-01-01' where user_id = v_cust::text;
    res := res || 'FAIL 6 update allowed'::text;
  exception when others then res := res || ('ok 6 append-only: ' || sqlerrm);
  end;

  -- 7. Accepted → quote allowed; status shows accepted; other user can't see rows.
  perform set_config('request.jwt.claims', cc, true); set local role authenticated;
  insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status)
  values (pa, 'lc-cust@example.invalid', d, 'Birthday', 'Parramatta', 50, '$1,000', 'pending') returning id into q;
  res := res || (case when q is not null then 'ok 7a quote allowed after acceptance' else 'FAIL 7a' end);
  select count(*) into n from public.my_legal_status() where required and not accepted;
  res := res || (case when n = 0 then 'ok 7b nothing outstanding' else 'FAIL 7b outstanding=' || n end);
  select count(*) into n from public.my_legal_status() where document = 'vendor_agreement' and required;
  res := res || (case when n = 0 then 'ok 7c vendor docs not required for customers' else 'FAIL 7c' end);
  select marketing_granted into b from public.my_legal_status() where document = 'marketing_emails';
  res := res || (case when b then 'ok 7d marketing granted' else 'FAIL 7d' end);
  -- 8. Listing needs the Vendor Agreement + fee schedule.
  begin
    insert into public.service_providers (name, service_type, hourly_rate, owner_email, available)
    values ('LC Listing', 'photographer', 100, 'lc-cust@example.invalid', true);
    res := res || 'FAIL 8a listing without vendor agreement'::text;
  exception when others then
    res := res || (case when sqlerrm like 'LEGAL_ACCEPTANCE_REQUIRED: vendor_agreement%' then 'ok 8a listing blocked' else 'FAIL 8a ' || sqlerrm end);
  end;
  begin
    perform public.record_legal_acceptance(array['vendor_agreement', 'vendor_fee_schedule'], 'signup');
    res := res || 'FAIL 8b user chose context signup'::text;
  exception when others then res := res || 'ok 8b users cannot claim signup context'::text;
  end;
  perform public.record_legal_acceptance(array['vendor_agreement', 'vendor_fee_schedule'], 'vendor_onboarding');
  insert into public.service_providers (name, service_type, hourly_rate, owner_email, available)
  values ('LC Listing', 'photographer', 100, 'lc-cust@example.invalid', true);
  res := res || 'ok 8c listing allowed after vendor acceptance'::text;
  -- 9. Marketing withdrawal is recorded as a new row.
  perform public.set_marketing_consent(false, 'settings');
  select marketing_granted into b from public.my_legal_status() where document = 'marketing_emails';
  res := res || (case when not b then 'ok 9 marketing withdrawn' else 'FAIL 9' end);
  -- 10. Deletion request: idempotent, own-only.
  rid := public.request_account_deletion('testing');
  rid2 := public.request_account_deletion('again');
  res := res || (case when rid = rid2 then 'ok 10a one pending request' else 'FAIL 10a' end);
  reset role;

  perform set_config('request.jwt.claims', co, true); set local role authenticated;
  select count(*) into n from public.legal_consents where user_id = v_cust::text;
  res := res || (case when n = 0 then 'ok 11a other user sees no consents' else 'FAIL 11a ' || n end);
  select count(*) into n from public.account_deletion_requests;
  res := res || (case when n = 0 then 'ok 11b other user sees no deletion requests' else 'FAIL 11b ' || n end);
  reset role;

  -- 12. Version bump requires re-acceptance.
  update public.legal_document_versions set version = '2026-12-01' where document = 'customer_terms';
  perform set_config('request.jwt.claims', cc, true); set local role authenticated;
  select count(*) into n from public.my_legal_status() where required and not accepted;
  res := res || (case when n = 1 then 'ok 12a terms update outstanding' else 'FAIL 12a ' || n end);
  begin
    insert into public.quote_requests (vendor_id, client_email, event_date, event_type, location, estimated_guests, budget_range, status)
    values (pa, 'lc-cust@example.invalid', d + 1, 'Birthday', 'Parramatta', 50, '$1,000', 'pending');
    res := res || 'FAIL 12b quote allowed on old terms'::text;
  exception when others then res := res || 'ok 12b blocked until re-accepted'::text;
  end;
  perform public.record_legal_acceptance(array['customer_terms'], 'terms_update');
  select count(*) into n from public.my_legal_status() where required and not accepted;
  res := res || (case when n = 0 then 'ok 12c re-accepted' else 'FAIL 12c ' || n end);

  -- 14. Old accept_terms revoked.
  begin
    perform public.accept_terms('2026-12-01');
    res := res || 'FAIL 14 accept_terms still callable'::text;
  exception when others then res := res || 'ok 14 accept_terms revoked'::text;
  end;
  reset role;

  -- (as owner role, but with an end-user JWT, like inside the plan RPCs)
  -- 13. Payment plans blocked while payments are off.
  begin
    insert into public.payment_plans (booking_id, customer_user_id, vendor_user_id, plan_type, total_cents)
    values ('x', v_cust, v_other, 'single', 100);
    res := res || 'FAIL 13 payment plan allowed'::text;
  exception when others then
    res := res || (case when sqlerrm like 'Online payments%' then 'ok 13 payment plan blocked: ' || sqlerrm else 'FAIL 13 ' || sqlerrm end);
  end;

  raise exception 'TEST RESULTS (rolled back)%', E'\n' || array_to_string(res, E'\n');
end
