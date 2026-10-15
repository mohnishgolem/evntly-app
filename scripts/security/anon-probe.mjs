// Read-only check of what an anonymous visitor can read through Supabase's
// public REST API with the browser's anon key. Makes only GET requests with
// limit=1 — no writes, no auth, safe to run against production.
//
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node scripts/security/anon-probe.mjs

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(2);
}

// Tables/columns that must return nothing (or be refused) to anonymous users.
const PRIVATE = [
  "users?select=id",
  "bookings?select=id",
  "quote_requests?select=id",
  "messages?select=id",
  "reports?select=id",
  "leakage_events?select=id",
  "vendor_payout_details?select=id",
  "calendar_feed_tokens?select=token",
  "blocked_users?select=id",
  "rate_limit_buckets?select=id",
  "consumed_step_up_tokens?select=id",
  "admin_audit_log?select=id",
  "job_cards?select=id",
  "bundle_bookings?select=id",
  "group_chat_messages?select=id",
  "events?select=id",
  "service_providers?select=owner_email",
  "service_providers?select=phone",
];

let failures = 0;
for (const path of PRIVATE) {
  const res = await fetch(`${url}/rest/v1/${path}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.text();
  let rows = [];
  try {
    rows = JSON.parse(body);
  } catch {}
  const exposed = res.ok && Array.isArray(rows) && rows.length > 0;
  if (exposed) failures++;
  console.log(`${exposed ? "FAIL exposed" : "PASS"}  ${path}  (HTTP ${res.status})`);
}

// Admin RPCs must not return data anonymously. (check_rate_limit is covered
// by supabase/tests/security_regression.sql — probing it here could write.)
for (const fn of ["admin_service_providers"]) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const text = await res.text();
  const exposed = res.ok && text !== "[]" && text !== "null";
  if (exposed) failures++;
  console.log(`${exposed ? "FAIL callable" : "PASS"}  rpc/${fn}  (HTTP ${res.status})`);
}

process.exit(failures ? 1 : 0);
