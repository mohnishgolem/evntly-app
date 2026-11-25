import { readMigration, setupDb } from "./supabase-stub";
import type { Rpc } from "@/lib/phone-agent/tools";

// Shared by the phone agent SQL tests and the conversation simulations.
export const phonePrereqs = `
  alter table auth.users add column email_confirmed_at timestamptz, add column raw_user_meta_data jsonb default '{}'::jsonb;
  alter table public.users add column created_at timestamptz default now();
  create table public.vendor_waitlist (id bigserial primary key, email text, email_normalized text generated always as (lower(btrim(email))) stored, unsubscribed_at timestamptz);
  create table public.page_views (id bigserial primary key, created_at timestamptz default now(), kind text, visitor_id text, vendor_id text, user_id uuid, source text,
    constraint page_views_kind_check check (kind in ('home')));
  create table public.funnel_events (id bigserial primary key, created_at timestamptz default now(), event text, source text, campaign text, detail text, visitor_id text,
    constraint funnel_events_event_check check (event in ('claim_click')));
  create table public.beta_applications (id uuid primary key default gen_random_uuid(), user_id text, campaign text, source text, status text, decided_at timestamptz);
  create table public.portfolio_items (id bigserial primary key, provider_id text, created_at timestamptz default now());
  create table public.vendor_packages (id bigserial primary key, provider_id text, active boolean default true, created_at timestamptz default now());
  create table public.quote_requests (id text primary key default gen_random_uuid()::text, vendor_id text, client_user_id uuid, created_at timestamptz default now());
  create table public.bookings (id text primary key default gen_random_uuid()::text, provider_id text, client_user_id uuid, status text, created_at timestamptz default now());
  create table public.events (id text primary key default gen_random_uuid()::text, organiser_user_id uuid, created_at timestamptz default now());
  create schema cron;
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ select 1::bigint $$;
`;
export const phoneMigrations = [
  phonePrereqs,
  readMigration("migrations/20261106090000_vendor_acquisition.sql"),
  readMigration("migrations/20261130090000_vendor_listing_drafts.sql"),
  readMigration("migrations/20261130100000_growth_dashboard.sql"),
  readMigration("migrations/20261202090000_phone_agent.sql"),
];

// Wednesday 2 Dec 2026, 11:00 Sydney (AEDT, +11).
export const WED_11AM = "2026-12-02T11:00:00+11:00";
export const setClock = (iso: string) =>
  `create or replace function public.phone_now() returns timestamptz language sql stable set search_path = '' as $$ select '${iso}'::timestamptz $$;`;

type Db = { exec: (q: string) => Promise<unknown>; query: (q: string, p?: unknown[]) => Promise<{ rows: Record<string, any>[] }> }; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Run a query as the service role (what our verified webhook routes use). */
export async function svc(db: Db, q: string, params: unknown[] = []) {
  await db.exec("set role service_role");
  try { return await db.query(q, params); } finally { await db.exec("reset role"); }
}


export const SAI = "+61400000001";
export const VENDOR = "+61411222333";

/** A fresh offline database with one call started for a scenario (prototype → Sai, pilot → a consenting prospect). */
export async function startSimulatedCall(s: { mode: "prototype" | "pilot"; vendorName: string; category: string; settings?: Record<string, unknown> }) {
  const { db, as, ADMIN } = await setupDb(phoneMigrations);
  await db.exec(setClock(WED_11AM));
  const settings = { mode: s.mode, prototype_numbers: [SAI], ...s.settings };
  await as(ADMIN, () => db.query("select public.admin_phone_update_settings($1::jsonb)", [JSON.stringify(settings)]));

  let prospectId: string | null = null;
  let phone = SAI;
  if (s.mode === "pilot") {
    phone = VENDOR;
    await as(ADMIN, () => db.query("select * from public.admin_import_prospects($1::jsonb, true)", [JSON.stringify([{ business_name: s.vendorName, category: s.category }])]));
    prospectId = (await db.query("select id from public.vendor_prospects")).rows[0].id;
    await as(ADMIN, () => db.query("select public.admin_phone_record_consent($1, $2, 'express_dm_reply', $3)", [prospectId, VENDOR, 'IG DM 1 Dec: "yes, happy for you to call"']));
    await as(ADMIN, () => db.query("select public.admin_phone_record_dncr($1, false, 'quick_check')", [VENDOR]));
  }
  const call = (await as(ADMIN, () => db.query("select * from public.admin_phone_start_call($1, $2)", [prospectId, phone]))).rows[0];

  const rpc: Rpc = async (fn, args) => {
    if (fn !== "phone_agent_tool") return { data: null, error: { message: "Not allowed." } };
    try {
      const r = await svc(db, "select public.phone_agent_tool($1, $2, $3, $4::jsonb) r", [args.p_ref, args.p_provider_call_id, args.p_tool, JSON.stringify(args.p_args)]);
      return { data: r.rows[0].r, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  };
  return { db, call: call as { call_id: string; ref: string }, rpc, prospectId };
}
