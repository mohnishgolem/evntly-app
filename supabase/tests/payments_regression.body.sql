declare
  res text[] := '{}';
  v_vendor uuid := gen_random_uuid();
  v_cust uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_booking text;
  v_plan uuid;
  v_dep uuid; v_m1 uuid; v_m2 uuid;
  n int;
  procedure_ok boolean;
begin
  -- Fixtures (as the migration owner; all rolled back).
  insert into auth.users (id, email, aud, role, instance_id) values
    (v_vendor, 'pt-vendor@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (v_cust,   'pt-cust@example.invalid',   'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (v_other,  'pt-other@example.invalid',  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  insert into public.bookings (provider_id, provider_name, provider_owner_email, service_type, event_date, total_price, status, escrow_status, client_email, client_name)
  values ((select id from public.service_providers where is_demo limit 1), 'PT Vendor', 'pt-vendor@example.invalid', 'dj', current_date + 30, 1000, 'pending', 'unpaid', 'pt-cust@example.invalid', 'PT Cust')
  returning id into v_booking;
  select count(*) into n from public.bookings where id = v_booking and provider_owner_user_id = v_vendor and client_user_id = v_cust;
  res := res || ('fixture booking ids synced: ' || n);

  -- 1. Customer can't propose.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.propose_payment_plan(v_booking, 'full', '[{"kind":"full","name":"All","amount_cents":100000}]');
    res := res || 'FAIL 1 customer proposed a plan'::text;
  exception when others then res := res || ('ok 1 customer cannot propose: ' || sqlerrm);
  end;
  reset role;

  -- 2. Amounts must sum to the total.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.propose_payment_plan(v_booking, 'full', '[{"kind":"full","name":"All","amount_cents":1}]');
    res := res || 'FAIL 2 wrong total accepted'::text;
  exception when others then res := res || ('ok 2 total enforced: ' || sqlerrm);
  end;
  reset role;

  -- 3. Deposit bounds.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.propose_payment_plan(v_booking, 'deposit_milestones',
      '[{"kind":"deposit","name":"Dep","amount_cents":5000},{"kind":"milestone","name":"Rest","amount_cents":95000}]');
    res := res || 'FAIL 3 5% deposit accepted'::text;
  exception when others then res := res || ('ok 3 deposit bounds: ' || sqlerrm);
  end;
  reset role;

  -- 4. Valid plan.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_plan := public.propose_payment_plan(v_booking, 'deposit_milestones',
      '[{"kind":"deposit","name":"Deposit","amount_cents":30000},
        {"kind":"milestone","name":"Planning","amount_cents":35000},
        {"kind":"milestone","name":"Event night","amount_cents":35000}]');
    res := res || 'ok 4 vendor proposed plan'::text;
  exception when others then res := res || ('FAIL 4 valid plan rejected: ' || sqlerrm);
  end;
  reset role;
  select id into v_dep from public.payment_milestones where plan_id = v_plan and position = 0;
  select id into v_m1 from public.payment_milestones where plan_id = v_plan and position = 1;
  select id into v_m2 from public.payment_milestones where plan_id = v_plan and position = 2;

  -- 5. Outsider and anon see nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (select count(*) from public.payment_plans where id = v_plan) + (select count(*) from public.payment_milestones where plan_id = v_plan)
       + (select count(*) from public.payment_events where plan_id = v_plan) into n;
  reset role;
  res := res || (case when n = 0 then 'ok 5 outsider sees 0 rows' else 'FAIL 5 outsider sees ' || n end);
  begin
    set local role anon;
    select count(*) into n from public.payment_plans;
    res := res || ('FAIL 5b anon could select plans: ' || n);
  exception when others then res := res || ('ok 5b anon denied: ' || sqlerrm);
  end;
  reset role;

  -- 6. Direct writes denied for parties.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.payment_milestones set funding_status = 'funded' where id = v_m1;
    res := res || 'FAIL 6 customer updated milestone directly'::text;
  exception when others then res := res || ('ok 6 direct update denied: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.payment_events (plan_id, actor_role, event) values (v_plan, 'admin', 'forged');
    res := res || 'FAIL 6b vendor forged an event'::text;
  exception when others then res := res || ('ok 6b event insert denied: ' || sqlerrm);
  end;
  reset role;

  -- 7. Only the customer agrees.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.respond_to_payment_plan(v_plan, true);
    res := res || 'FAIL 7 vendor agreed for the customer'::text;
  exception when others then res := res || ('ok 7 vendor cannot agree: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.respond_to_payment_plan(v_plan, true);
    res := res || 'ok 7b customer agreed'::text;
  exception when others then res := res || ('FAIL 7b customer agree: ' || sqlerrm);
  end;
  reset role;

  -- 8. Agreed plans are frozen.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.propose_payment_plan(v_booking, 'full', '[{"kind":"full","name":"All","amount_cents":100000}]');
    res := res || 'FAIL 8 agreed plan replaced'::text;
  exception when others then res := res || ('ok 8 agreed plan frozen: ' || sqlerrm);
  end;
  reset role;

  -- 9. Vendor submits; vendor can't approve; customer approves.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.update_milestone_work(v_m1, 'submitted', 'Done', array[v_plan::text || '/proof.jpg']);
    res := res || 'ok 9 vendor submitted'::text;
  exception when others then res := res || ('FAIL 9 submit: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.review_milestone(v_m1, true);
    res := res || 'FAIL 9b vendor approved own work'::text;
  exception when others then res := res || ('ok 9b vendor cannot approve: ' || sqlerrm);
  end;
  reset role;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.review_milestone(v_m1, true);
    res := res || 'ok 9c customer approved'::text;
  exception when others then res := res || ('FAIL 9c approve: ' || sqlerrm);
  end;
  reset role;

  -- 10. Evidence outside the plan folder is refused.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.update_milestone_work(v_m2, 'submitted', 'x', array['someone-else/secret.pdf']);
    res := res || 'FAIL 10 foreign evidence path accepted'::text;
  exception when others then res := res || ('ok 10 evidence path checked: ' || sqlerrm);
  end;
  reset role;

  -- 11. claim_milestone_payout is server-only.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.claim_milestone_payout(v_m1);
    res := res || 'FAIL 11 customer could claim payout'::text;
  exception when others then res := res || ('ok 11 claim denied to users: ' || sqlerrm);
  end;
  reset role;

  -- 12. Approved but unfunded / no vendor account → nothing to release.
  select count(*) into n from public.claim_milestone_payout(v_m1);
  res := res || (case when n = 0 then 'ok 12 unfunded not releasable' else 'FAIL 12 unfunded claimed' end);
  update public.payment_milestones set funding_status = 'funded', charge_id = 'ch_test' where id in (v_dep, v_m1, v_m2);
  select count(*) into n from public.claim_milestone_payout(v_m1);
  res := res || (case when n = 0 then 'ok 12b no connected account → not releasable' else 'FAIL 12b released without account' end);
  insert into public.stripe_accounts (user_id, account_id, details_submitted, transfers_active, payouts_enabled)
    values (v_vendor, 'acct_test', true, true, true);

  -- 13. Funded + approved + account → exactly one claim.
  select count(*) into n from public.claim_milestone_payout(v_m1);
  res := res || (case when n = 1 then 'ok 13 releasable claimed once' else 'FAIL 13 claim count ' || n end);
  select count(*) into n from public.claim_milestone_payout(v_m1);
  res := res || (case when n = 0 then 'ok 13b second claim refused (no double payout)' else 'FAIL 13b double claim' end);

  -- 14. Deposit waits for the vendor to confirm the booking.
  select count(*) into n from public.claim_milestone_payout(v_dep);
  res := res || (case when n = 0 then 'ok 14 deposit held until booking confirmed' else 'FAIL 14 deposit released early' end);
  perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.bookings set status = 'confirmed' where id = v_booking;
  reset role;
  select count(*) into n from public.claim_milestone_payout(v_dep);
  res := res || (case when n = 1 then 'ok 14b deposit releasable after confirmation' else 'FAIL 14b deposit claim ' || n end);

  -- 15. Funded but not approved milestone stays put; disputes freeze.
  select count(*) into n from public.claim_milestone_payout(v_m2);
  res := res || (case when n = 0 then 'ok 15 unapproved not releasable' else 'FAIL 15 unapproved released' end);
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.dispute_milestone(v_m2, 'The equipment never arrived on the night.');
    res := res || 'ok 15b customer disputed'::text;
  exception when others then res := res || ('FAIL 15b dispute: ' || sqlerrm);
  end;
  reset role;
  update public.payment_milestones set work_status = 'approved' where id = v_m2 and false; -- (no-op: approval can't bypass a dispute)
  select count(*) into n from public.claim_milestone_payout(v_m2);
  res := res || (case when n = 0 then 'ok 15c disputed not releasable' else 'FAIL 15c disputed released' end);

  -- 16. Booking money fields still locked for parties.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.bookings set escrow_status = 'released' where id = v_booking;
    res := res || 'FAIL 16 customer changed escrow_status'::text;
  exception when others then res := res || ('ok 16 booking money fields locked: ' || sqlerrm);
  end;
  reset role;

  -- 17. Activity log recorded the flow.
  select count(*) into n from public.payment_events where plan_id = v_plan;
  res := res || ('info 17 events logged: ' || n);
  select count(*) into n from public.bookings where escrow_status = 'held';
  res := res || ('info 18 bookings still marked held: ' || n);

  raise exception 'TEST RESULTS (rolled back)%', E'\n' || array_to_string(res, E'\n');
end
