-- Listing completion gate (20261119090000_listing_completion_gate.sql).
-- Synthetic users only; the final RAISE rolls everything back. Every line of
-- the report must start with PASS.

create or replace function pg_temp.act_as(uid uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('role', 'postgres', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
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

-- Three portfolio items in the owner's own folder (inserted as the DB owner).
create or replace function pg_temp.add_photos(listing text, owner uuid, owner_email text, n int) returns void language plpgsql as $$
begin
  for i in 1..n loop
    insert into public.portfolio_items (provider_id, owner_email, media_type, media_url)
    values (listing, owner_email, 'image',
      'https://pzeosxtdulveuywhmkfe.supabase.co/storage/v1/object/public/portfolio/' || owner || '/' || listing || '/' || gen_random_uuid() || '.jpg');
  end loop;
end $$;

do $$
declare
  out text := '';
  admin uuid; vendor uuid; other uuid;
  draft_id text; legacy_id text; queued_id text; demo_id text;
  app_status text; r text; n int; st text;
begin
  admin  := pg_temp.new_user('cg-admin@example.invalid',  '{"full_name":"Admin"}');
  vendor := pg_temp.new_user('cg-vendor@example.invalid', '{"role":"vendor","full_name":"Vendor"}');
  other  := pg_temp.new_user('cg-other@example.invalid',  '{"role":"vendor","full_name":"Other"}');
  alter table public.users disable trigger trg_users_lockdown;
  update public.users set role = 'admin' where id = admin::text;
  alter table public.users enable trigger trg_users_lockdown;
  perform set_config('evntly.cg', 'on', true);

  -- G1: a vendor's new listing is saved as a draft, whatever status it sends.
  perform pg_temp.act_as(vendor);
  perform public.record_legal_acceptance(array['customer_terms', 'privacy_policy', 'cancellation_policy', 'vendor_agreement', 'vendor_fee_schedule'], 'vendor_onboarding');
  insert into public.service_providers (name, owner_email, service_type, hourly_rate, status, abn)
  values ('CG Draft', 'cg-vendor@example.invalid', 'dj', 100, 'pending_review', '51824753556') returning id into draft_id;
  select status into st from public.service_providers where id = draft_id;
  out := out || E'\n' || case when st = 'draft' then 'PASS' else 'FAIL' end || ' G1 new vendor listing starts as draft -> ' || st;

  -- G2: claiming a founding place with a draft listing stays "started".
  select c.status into app_status from public.claim_founding_vendor_place(null, 'instagram_dm', null) c;
  out := out || E'\n' || case when app_status = 'started' then 'PASS' else 'FAIL' end || ' G2 founding claim with a draft stays started -> ' || app_status;

  -- G3: the vendor can't move their own listing to review by hand.
  begin
    update public.service_providers set status = 'pending_review' where id = draft_id;
    out := out || E'\nFAIL G3 vendor changed status directly';
  exception when others then out := out || E'\nPASS G3 vendor cannot change status directly';
  end;

  -- G4: submitting with no photos is refused.
  begin
    r := public.submit_listing_for_review(draft_id);
    out := out || E'\nFAIL G4 submitted with 0 photos -> ' || r;
  exception when others then
    out := out || E'\n' || case when sqlerrm like 'Add at least 3 photos%' then 'PASS' else 'FAIL' end || ' G4 0 photos refused -> ' || sqlerrm;
  end;

  -- G5: 3 photos but no package is refused.
  perform pg_temp.act_as(null);
  perform pg_temp.add_photos(draft_id, vendor, 'cg-vendor@example.invalid', 3);
  perform pg_temp.act_as(vendor);
  begin
    r := public.submit_listing_for_review(draft_id);
    out := out || E'\nFAIL G5 submitted without a package -> ' || r;
  exception when others then
    out := out || E'\n' || case when sqlerrm like 'Add at least one package%' then 'PASS' else 'FAIL' end || ' G5 no package refused -> ' || sqlerrm;
  end;

  -- G6: someone else can't submit it.
  insert into public.vendor_packages (provider_id, name, price_cents) values (draft_id, 'Party 3h', 65000);
  perform pg_temp.act_as(other);
  begin
    r := public.submit_listing_for_review(draft_id);
    out := out || E'\nFAIL G6 another user submitted it -> ' || r;
  exception when others then out := out || E'\nPASS G6 another user cannot submit -> ' || sqlerrm;
  end;

  -- G7: complete draft submits; the founding application moves with it.
  perform pg_temp.act_as(vendor);
  r := public.submit_listing_for_review(draft_id);
  perform pg_temp.act_as(null);
  select status into st from public.service_providers where id = draft_id;
  select status into app_status from public.beta_applications where provider_id = draft_id;
  out := out || E'\n' || case when r = 'founding_submitted' and st = 'pending_review' and app_status = 'submitted' then 'PASS' else 'FAIL' end
    || ' G7 complete draft submitted -> ' || r || ' / ' || st || ' / ' || app_status;

  -- G8: an incomplete listing waiting for review can't be approved (admin, aal2).
  insert into public.service_providers (name, owner_email, service_type, hourly_rate, status)
  values ('CG Queued', 'cg-other@example.invalid', 'photographer', 120, 'pending_review') returning id into queued_id;
  perform pg_temp.act_as(admin, 'aal2');
  begin
    update public.service_providers set status = 'approved' where id = queued_id;
    out := out || E'\nFAIL G8 incomplete listing approved';
  exception when others then
    out := out || E'\n' || case when sqlerrm like 'This listing can''t be approved yet%' then 'PASS' else 'FAIL' end || ' G8 incomplete approval refused -> ' || sqlerrm;
  end;

  -- G9: the complete one can be approved, through the founding decision too.
  begin
    perform public.admin_decide_founding_application(
      (select id from public.beta_applications where provider_id = draft_id), 'approved', null);
    select status into st from public.service_providers where id = draft_id;
    out := out || E'\n' || case when st = 'approved' then 'PASS' else 'FAIL' end || ' G9 complete listing approved via founding decision -> ' || st;
  exception when others then out := out || E'\nFAIL G9 complete approval: ' || sqlerrm;
  end;

  -- G10: an already-approved listing without photos keeps its approval when
  -- anything else changes (existing vendors are never un-approved).
  perform pg_temp.act_as(null);
  insert into public.service_providers (name, owner_email, service_type, hourly_rate, status)
  values ('CG Legacy', 'cg-other@example.invalid', 'dj', 90, 'approved') returning id into legacy_id;
  perform pg_temp.act_as(other);
  update public.service_providers set bio = 'Still here' where id = legacy_id;
  perform pg_temp.act_as(admin, 'aal2');
  update public.service_providers set status = 'approved', founding_vendor = true where id = legacy_id;
  select status into st from public.service_providers where id = legacy_id;
  out := out || E'\n' || case when st = 'approved' then 'PASS' else 'FAIL' end || ' G10 legacy approved listing stays approved -> ' || st;

  -- G11: sample listings are exempt.
  perform pg_temp.act_as(null);
  insert into public.service_providers (name, owner_email, service_type, hourly_rate, status, is_demo)
  values ('CG Demo', 'demo-cg@evntly.test', 'dj', 90, 'suspended', true) returning id into demo_id;
  update public.service_providers set status = 'approved' where id = demo_id;
  select status into st from public.service_providers where id = demo_id;
  out := out || E'\n' || case when st = 'approved' then 'PASS' else 'FAIL' end || ' G11 sample listing approval unaffected -> ' || st;

  -- G12: setup requests — owner of a draft only; vendors can't mark them ready.
  perform pg_temp.act_as(vendor);
  insert into public.service_providers (name, owner_email, service_type, hourly_rate, abn)
  values ('CG Draft 2', 'cg-vendor@example.invalid', 'mc', 100, '51824753556') returning id into queued_id;
  insert into public.listing_setup_requests (provider_id, services, photo_permission)
  values (queued_id, 'Birthday MC 4 hours $700', true);
  out := out || E'\nPASS G12a owner can ask for setup on a draft';
  begin
    insert into public.listing_setup_requests (provider_id, services, photo_permission)
    values (queued_id, 'Second request here', true);
    out := out || E'\nFAIL G12b second open request accepted';
  exception when others then out := out || E'\nPASS G12b one open request at a time';
  end;
  update public.listing_setup_requests set status = 'ready' where provider_id = queued_id;
  get diagnostics n = row_count;
  out := out || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ' G12c vendor cannot mark a request ready -> rows ' || n;
  perform pg_temp.act_as(other);
  begin
    insert into public.listing_setup_requests (provider_id, services, photo_permission)
    values (queued_id, 'Not my listing at all', true);
    out := out || E'\nFAIL G12d other user asked for setup on someone else''s listing';
  exception when others then out := out || E'\nPASS G12d other users cannot ask for someone else''s listing';
  end;
  select count(*) into n from public.listing_setup_requests where provider_id = queued_id;
  out := out || E'\n' || case when n = 0 then 'PASS' else 'FAIL' end || ' G12e other users cannot read the request -> ' || n;
  perform pg_temp.act_as(admin, 'aal2');
  update public.listing_setup_requests set status = 'ready' where provider_id = queued_id;
  get diagnostics n = row_count;
  out := out || E'\n' || case when n = 1 then 'PASS' else 'FAIL' end || ' G12f admin can mark it ready -> rows ' || n;

  -- G13: reminder log and completion counts aren't readable by users.
  perform pg_temp.act_as(vendor);
  begin
    select count(*) into n from public.listing_completion_reminders;
    out := out || E'\nFAIL G13a vendor read the reminder log';
  exception when others then out := out || E'\nPASS G13a reminder log is service-role only';
  end;
  begin
    perform public.listing_completion(draft_id);
    out := out || E'\nFAIL G13b vendor called listing_completion';
  exception when others then out := out || E'\nPASS G13b listing_completion not callable by users';
  end;
  perform pg_temp.act_as(null);

  raise exception 'LISTING COMPLETION GATE RESULTS (rolled back):%', out;
end $$;
