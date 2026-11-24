// Local stand-in for Supabase's REST API, for screenshots of the isolated
// dev server only. Serves fixture listings (all is_demo = sample listings, no
// ratings or reviews) and empty results for everything else. Never talks to
// a real database.
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const PORT = 54399;
const DIR = process.env.FIXTURE_DIR ?? path.dirname(new URL(import.meta.url).pathname);
const BASE = `http://127.0.0.1:${PORT}/fixtures`;
const now = new Date().toISOString();

const rows = [
  ["photographer", "Harbourlight Photography", "Mosman", "hourly", 180, null, "wedding.jpg", -33.829, 151.244],
  ["dj", "Northside Sound DJs", "Chatswood", "from", null, 900, "dj.jpg", -33.797, 151.181],
  ["decorator", "Bloom & Arch Styling", "Parramatta", "from", null, 1200, "arch.jpg", -33.815, 151.003],
  ["cakes_desserts", "Sugarleaf Cakes", "Surry Hills", "from", null, 450, "cake.jpg", -33.886, 151.211],
  ["caterer", "Long Table Catering", "Marrickville", "from", null, 35, "grazing.jpg", -33.911, 151.155],
  ["makeup_artist", "Glow Studio Bridal", "Bondi", "from", null, 220, "makeup.jpg", -33.891, 151.274],
  ["videographer", "Golden Hour Films", "Manly", "from", null, 2400, "video.jpg", -33.797, 151.288],
  ["florist", "Fern & Peony Florals", "Newtown", "from", null, 180, "bouquet.jpg", -33.898, 151.179],
  ["celebrant", "Vows by the Harbour", "Balmain", "fixed", null, 650, null, -33.859, 151.179],
  ["mc", "Mic Check MCs", "Ryde", "hourly", 150, null, null, -33.815, 151.104],
];
// Three deliberate shapes for the card tests:
//  0  complete: photo, verified, founding, rating + reviews, hourly price, available
//  8  incomplete: no photo, no suburb, quote-only price, not available
//  10 missing fields: very long name, every optional field null
const OVERRIDES = {
  0: { verified: true, founding_vendor: true, rating: 4.9, review_count: 23, rating_sum: 112.7, available: true },
  8: { city: null, pricing_model: "quote", hourly_rate: null, base_price: null, available: false },
  10: {
    name: "The Extraordinarily Long-Named Celebration Styling & Event Design Collective of Greater Western Sydney",
    city: null, pricing_model: null, hourly_rate: null, base_price: null, rating: null, review_count: null, rating_sum: null,
    portfolio_urls: null, event_types: null, languages: null, available: null, latitude: null, longitude: null, description: null,
  },
};
rows.push(["decorator", "placeholder", null, null, null, null, null, null, null]);
const vendors = rows.map(([service_type, name, city, pricing_model, hourly_rate, base_price, photo, latitude, longitude], i) => ({
  id: `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
  created_at: now, updated_at: now, created_by: null,
  name, bio: null, service_type, description: `${name} — sample listing for local UI testing.`,
  hourly_rate, pricing_model, base_price, rating: null, review_count: 0, rating_sum: 0,
  acceptance_rate: null, avg_response_hours: null, verified: false, founding_vendor: i % 3 === 1,
  latitude, longitude, city, postcode: null, avatar_url: null,
  portfolio_urls: photo ? [`${BASE}/${photo}`] : [], equipment_list: [], available: i % 2 === 0,
  experience_years: null, event_types: ["Wedding", "Birthday", "Corporate"], languages: ["English"],
  packages: [], pricing_options: [], status: "approved", service_radius_km: 50, unavailable_dates: [],
  weekly_unavailable_days: [], cancellation_policy: null, locations_serviced: [], abn: null, gst_registered: false,
  is_demo: true, min_booking_hours: null, free_travel_km: null, travel_fee_cents_per_km: null, travels_regional: false,
  availability_confirmed_at: null,
  ...(OVERRIDES[i] ?? {}),
}));

function filterVendors(params) {
  let out = vendors;
  for (const [key, value] of params) {
    if (key === "service_type" && value.startsWith("eq.")) out = out.filter((v) => v.service_type === value.slice(3));
    if (key === "id" && value.startsWith("eq.")) out = out.filter((v) => v.id === value.slice(3));
    if (key === "id" && value.startsWith("in.(")) {
      const ids = value.slice(4, -1).split(",").map((s) => s.replaceAll('"', ""));
      out = out.filter((v) => ids.includes(v.id));
    }
    if (key === "event_types" && value.startsWith("cs.")) {
      const want = value.slice(4, -1).replaceAll('"', "");
      out = out.filter((v) => (v.event_types ?? []).includes(want));
    }
    if (key === "hourly_rate" && value.startsWith("gte.")) out = out.filter((v) => v.hourly_rate != null && v.hourly_rate >= +value.slice(4));
    if (key === "hourly_rate" && value.startsWith("lte.")) out = out.filter((v) => v.hourly_rate != null && v.hourly_rate <= +value.slice(4));
    if (key === "or") {
      const m = value.match(/ilike\."?%([^%]*)%/);
      if (m) {
        const term = m[1].toLowerCase();
        out = out.filter((v) => [v.name, v.city, v.description].some((f) => f?.toLowerCase().includes(term)));
      }
    }
  }
  const limit = params.get("limit");
  return limit ? out.slice(0, +limit) : out;
}

// ── Signed-in QA: an in-memory stand-in for the tables and RPCs customer
// pages use. One test customer; tokens are HS256 so the app confirms them
// with /auth/v1/user (below) instead of verifying a signature.
const TEST_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "qa-customer@example.test",
  user_metadata: { full_name: "Test Customer" },
  app_metadata: { provider: "email" },
  created_at: now,
};
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const WEDDING_ID = "22222222-2222-4222-8222-222222222223";
const CORPORATE_ID = "22222222-2222-4222-8222-222222222224";
const PARTY_ID = "22222222-2222-4222-8222-222222222225";
const EVENT_DEFAULTS = { organiser_user_id: TEST_USER.id, organiser_email: TEST_USER.email, status: "planning", created_at: now, notes: null, start_time: null, end_time: null, latitude: -33.87, longitude: 151.2, category_budgets: {}, planner_dismissed: [] };
const BOOKING_DEFAULTS = { client_user_id: TEST_USER.id, created_at: now, updated_at: now, start_time: null, end_time: null, event_time: null, duration_hours: null, notes: null };
const QUOTE_DEFAULTS = { client_user_id: TEST_USER.id, created_at: now, expires_at: new Date(Date.now() + 5 * 864e5).toISOString(), event_date: inDays(200), event_type: "Wedding", location: "Mosman", estimated_guests: "120", budget_range: null, vendor_note: null, booking_id: null, match_score: null };
const store = {
  users: [{ id: TEST_USER.id, email: TEST_USER.email, full_name: "Test Customer", role: "customer", saved_providers: [], created_at: "2026-09-01T00:00:00.000Z", terms_accepted_at: now, privacy_accepted_at: now, terms_version: "2026-10-25", onboarding_completed_at: now }],
  events: [
    { ...EVENT_DEFAULTS, id: EVENT_ID, name: "Mia's 30th", event_type: "Birthday", event_date: inDays(40), suburb: "Bondi", guest_count: "60", budget_total: 6000, required_services: ["photographer", "dj", "florist"] },
    // Planner scenarios (synthetic): a wedding mid-planning, a corporate
    // event with every vendor confirmed, a party with nothing booked yet.
    { ...EVENT_DEFAULTS, id: WEDDING_ID, name: "Sam & Priya's wedding", event_type: "Wedding", event_date: inDays(200), suburb: "Mosman", guest_count: "120", budget_total: 42000, required_services: ["photographer", "dj", "florist", "celebrant"], start_time: "15:00:00", end_time: "23:00:00", planner_dismissed: [] },
    { ...EVENT_DEFAULTS, id: CORPORATE_ID, name: "Harbour team offsite", event_type: "Corporate", event_date: inDays(30), suburb: "Barangaroo", guest_count: "80", budget_total: 15000, required_services: ["caterer", "photographer", "mc"], start_time: "09:00:00", end_time: "17:00:00" },
    { ...EVENT_DEFAULTS, id: PARTY_ID, name: null, event_type: "Party", event_date: inDays(15), suburb: "Newtown", guest_count: "40", budget_total: 2000, required_services: [] },
  ],
  bookings: [
    { ...BOOKING_DEFAULTS, id: "33333333-3333-4333-8333-333333333333", event_id: EVENT_ID, provider_id: vendors[0].id, provider_name: vendors[0].name, service_type: "photographer", status: "confirmed", event_date: inDays(40), total_price: 1440 },
    { ...BOOKING_DEFAULTS, id: "33333333-3333-4333-8333-333333333334", event_id: WEDDING_ID, provider_id: vendors[0].id, provider_name: vendors[0].name, service_type: "photographer", status: "confirmed", event_date: inDays(200), total_price: 4200, start_time: "14:00:00", end_time: "22:00:00" },
    { ...BOOKING_DEFAULTS, id: "33333333-3333-4333-8333-333333333335", event_id: CORPORATE_ID, provider_id: vendors[4].id, provider_name: vendors[4].name, service_type: "caterer", status: "confirmed", event_date: inDays(30), total_price: 3800, start_time: "11:30:00" },
    { ...BOOKING_DEFAULTS, id: "33333333-3333-4333-8333-333333333336", event_id: CORPORATE_ID, provider_id: vendors[0].id, provider_name: vendors[0].name, service_type: "photographer", status: "confirmed", event_date: inDays(30), total_price: 1200, start_time: "09:00:00" },
    { ...BOOKING_DEFAULTS, id: "33333333-3333-4333-8333-333333333337", event_id: CORPORATE_ID, provider_id: vendors[9].id, provider_name: vendors[9].name, service_type: "mc", status: "confirmed", event_date: inDays(30), total_price: 900 },
  ],
  job_cards: [{ id: "jc-1", booking_id: "33333333-3333-4333-8333-333333333334", arrival_time: "13:30:00", status: "confirmed", event_date: inDays(200), service_type: "photographer", vendor_email: "x@example.test", created_at: now, updated_at: now }],
  event_tasks: [
    { id: "task-1", event_id: WEDDING_ID, owner_user_id: TEST_USER.id, owner_email: TEST_USER.email, title: "Guests arrive", kind: "schedule", due_date: inDays(200), due_time: "14:30:00", details: null, done: false, dismissed: false, position: 1, template_key: null, created_at: now },
    { id: "task-2", event_id: WEDDING_ID, owner_user_id: TEST_USER.id, owner_email: TEST_USER.email, title: "Speeches", kind: "schedule", due_date: inDays(200), due_time: "19:30:00", details: "Best man, then parents", done: false, dismissed: false, position: 2, template_key: null, created_at: now },
    { id: "task-3", event_id: WEDDING_ID, owner_user_id: TEST_USER.id, owner_email: TEST_USER.email, title: "Pay the photographer's deposit", kind: "reminder", due_date: inDays(21), due_time: null, details: null, done: false, dismissed: false, position: 3, template_key: null, created_at: now },
    { id: "task-4", event_id: WEDDING_ID, owner_user_id: TEST_USER.id, owner_email: TEST_USER.email, title: "Song ideas for the entrance", kind: "note", due_date: null, due_time: null, details: "Something acoustic, not too slow", done: false, dismissed: false, position: 4, template_key: null, created_at: now },
    { id: "task-5", event_id: WEDDING_ID, owner_user_id: TEST_USER.id, owner_email: TEST_USER.email, title: "Confirm your venue", kind: "task", due_date: null, due_time: null, details: null, done: true, dismissed: false, position: 5, template_key: "confirm_venue", created_at: now },
  ],
  quote_requests: [
    { ...QUOTE_DEFAULTS, id: "q-1", event_id: WEDDING_ID, vendor_id: vendors[1].id, vendor_name: vendors[1].name, service_type: "dj", status: "pending", quoted_amount: null },
    { ...QUOTE_DEFAULTS, id: "q-2", event_id: WEDDING_ID, vendor_id: vendors[7].id, vendor_name: vendors[7].name, service_type: "florist", status: "quoted", quoted_amount: 1850 },
  ],
  page_views: [],
  event_vendors: [],
  messages: [],
  reviews: [],
  event_budget_items: [],
};
// Production fills owner ids from emails (sync_user_ids trigger) and gives
// new events their column defaults.
const OWNER_DEFAULTS = {
  events: { organiser_user_id: TEST_USER.id, planner_dismissed: [], category_budgets: {}, latitude: null, longitude: null },
  event_tasks: { owner_user_id: TEST_USER.id, dismissed: false, position: 0, kind: "task" },
};
const RPC = {
  my_unread_message_count: () => 2,
  my_conversations: () => [],
  my_quote_requests: () => store.quote_requests,
  booked_vendor_ids_on: () => [],
  my_service_providers: () => [],
  my_notification_preferences: () => [],
};

function b64url(s) { return Buffer.from(s).toString("base64url"); }
export function testToken() {
  return [b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })), b64url(JSON.stringify({ sub: TEST_USER.id, email: TEST_USER.email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400, user_metadata: TEST_USER.user_metadata, session_id: "qa" })), "qa-signature"].join(".");
}
function bearerUser(req) {
  const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  try {
    const p = JSON.parse(Buffer.from(t.split(".")[1] ?? "", "base64url").toString());
    return p.sub === TEST_USER.id && t.endsWith(".qa-signature") ? TEST_USER : null;
  } catch { return null; }
}

// PostgREST-style filters: eq, neq, in, is, not.is, gte, lte, gt, lt, cs.
function matches(row, key, raw) {
  const neg = raw.startsWith("not.");
  const v = neg ? raw.slice(4) : raw;
  const dot = v.indexOf(".");
  const op = v.slice(0, dot), arg = v.slice(dot + 1);
  const cell = row[key];
  let ok;
  if (op === "eq") ok = String(cell) === arg;
  else if (op === "neq") ok = String(cell) !== arg;
  else if (op === "in") ok = arg.slice(1, -1).split(",").map((x) => x.replaceAll('"', "")).includes(String(cell));
  else if (op === "is") ok = arg === "null" ? cell == null : String(cell) === arg;
  else if (op === "gte") ok = cell != null && cell >= arg;
  else if (op === "lte") ok = cell != null && cell <= arg;
  else if (op === "gt") ok = cell != null && cell > arg;
  else if (op === "lt") ok = cell != null && cell < arg;
  else if (op === "cs") { const want = arg.replace(/^[{[]|[}\]]$/g, "").split(",").map((x) => x.replaceAll('"', "")); ok = Array.isArray(cell) && want.every((w) => cell.includes(w)); }
  else ok = true;
  return neg ? !ok : ok;
}
const RESERVED = new Set(["select", "order", "limit", "offset", "or", "on_conflict", "columns"]);
function query(rows, params) {
  let out = rows.filter((r) => [...params].every(([k, v]) => RESERVED.has(k) || matches(r, k, v)));
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    out = [...out].sort((x, y) => (x[col] > y[col] ? 1 : x[col] < y[col] ? -1 : 0) * (dir === "desc" ? -1 : 1));
  }
  const limit = params.get("limit");
  return limit ? out.slice(0, +limit) : out;
}
function readBody(req) {
  return new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(d ? JSON.parse(d) : null); } catch { r(null); } }); });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", ...headers });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") return send(204);
    if (url.pathname.startsWith("/fixtures/")) {
      const file = path.join(DIR, "photos", path.basename(url.pathname));
      if (!existsSync(file)) return send(404, { error: "not found" });
      res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "max-age=3600" });
      return res.end(readFileSync(file));
    }
    if (url.pathname === "/auth/v1/user") { const u = bearerUser(req); return u ? send(200, u) : send(401, { message: "invalid token" }); }
    if (url.pathname === "/auth/v1/logout") return send(204);
    if (url.pathname === "/auth/v1/.well-known/jwks.json") return send(200, { keys: [] });
    if (url.pathname.startsWith("/auth/")) return send(401, { message: "isolated: no auth" });
    if (url.pathname === "/__qa/token") return send(200, { access_token: testToken(), user: TEST_USER });
    if (url.pathname === "/__qa/state") return send(200, { saved: store.users[0].saved_providers, page_views: store.page_views.length, event_tasks: store.event_tasks, planner_events: store.planner_events ?? [], events: store.events.map((e) => ({ id: e.id, planner_dismissed: e.planner_dismissed })) });
    if (url.pathname === "/rest/v1/service_providers") {
      const data = filterVendors(url.searchParams);
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return data[0] ? send(200, data[0]) : send(406, { code: "PGRST116", message: "no rows" });
      return send(200, data, { "content-range": `0-${Math.max(data.length - 1, 0)}/${data.length}` });
    }
    if (url.pathname === "/rest/v1/portfolio_items") {
      // Vendor 01 gets a portfolio (bright and dark photos) for lightbox tests.
      const pid = (url.searchParams.get("provider_id") ?? "").replace(/^eq\./, "");
      const photos = pid.endsWith("01") ? ["wedding.jpg", "bouquet.jpg", "cake.jpg", "arch.jpg"] : [];
      return send(200, photos.map((f, i) => ({ id: `p${i}`, created_at: now, updated_at: now, provider_id: pid, media_type: "image", media_url: `${BASE}/${f}`, thumbnail_url: null, caption: null, event_type_tag: null, sort_order: i })));
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = RPC[url.pathname.slice("/rest/v1/rpc/".length)];
      const data = fn ? fn() : [];
      return send(200, Array.isArray(data) ? query(data, url.searchParams) : data);
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = (store[table] ??= []);
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const wantRows = (req.headers.prefer ?? "").includes("return=representation");
      if (req.method === "POST") {
        const body = await readBody(req);
        const added = (Array.isArray(body) ? body : [body]).filter(Boolean).map((r) => ({ id: r.id ?? (table === "events" ? `22222222-2222-4222-8222-${String(900000000000 + rows.length).padStart(12, "0")}` : `${table}-${rows.length + 1}`), created_at: new Date().toISOString(), ...OWNER_DEFAULTS[table], ...r }));
        rows.push(...added);
        return wantRows ? send(201, single ? added[0] : added) : send(201);
      }
      if (req.method === "PATCH") {
        const body = await readBody(req);
        const hit = query(rows, url.searchParams);
        hit.forEach((r) => Object.assign(r, body));
        return wantRows ? send(200, single ? hit[0] ?? null : hit) : send(204);
      }
      if (req.method === "DELETE") {
        const hit = new Set(query(rows, url.searchParams));
        store[table] = rows.filter((r) => !hit.has(r));
        return send(204);
      }
      const data = query(rows, url.searchParams);
      if (single) return data[0] ? send(200, data[0]) : send(406, { code: "PGRST116", message: "no rows" });
      return send(200, data, { "content-range": `0-${Math.max(data.length - 1, 0)}/${data.length}` });
    }
    send(404, { error: "isolated mock" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock supabase on ${PORT}`));
