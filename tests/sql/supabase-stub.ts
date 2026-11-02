import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// PGlite (Postgres in WebAssembly, offline) with stand-ins for the Supabase
// pieces the founding-vendor migrations use: auth schema and roles,
// is_admin(), users, service_providers and admin_audit_log.

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const readMigration = (file: string) =>
  readFileSync(path.resolve(import.meta.dirname, "../../supabase", file), "utf8");

export async function setupDb(migrations: string[]) {
  const pg = new PGlite();
  // Rows are untyped SQL results; the checks below read them loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = Record<string, any>;
  const db = {
    exec: (sql: string) => pg.exec(sql),
    query: (sql: string, params?: unknown[]) => pg.query<Row>(sql, params),
  };

  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
  grant execute on all functions in schema auth to anon, authenticated;
  create table public.users (id text primary key, email text, role text, suspended_at timestamptz);
  create table public.service_providers (id text primary key default gen_random_uuid()::text, owner_user_id uuid, name text,
    status text default 'pending_review', is_demo boolean default false, founding_vendor boolean default false, created_at timestamptz default now());
  create table public.admin_audit_log (id bigserial primary key, created_at timestamptz default now(), actor_user_id uuid, action text not null,
    target_table text not null, target_id text not null, old_value jsonb, new_value jsonb);
  create function public.is_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
    select exists (select 1 from public.users u where u.id = (select auth.uid())::text and u.role = 'admin')
    and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'; $$;
  grant usage on schema public to anon, authenticated;
  grant select, insert on public.service_providers to authenticated;
  `);
  for (const m of migrations) await db.exec(m);

  const ADMIN = "00000000-0000-0000-0000-00000000000a";
  const A = "00000000-0000-0000-0000-0000000000a1";
  const B = "00000000-0000-0000-0000-0000000000b1";
  const C = "00000000-0000-0000-0000-0000000000c1";
  for (const [id, email, role] of [[ADMIN, "admin@evntlyapp.com", "admin"], [A, "alice@photo.com.au", "vendor"], [B, "bob@dj.com.au", "vendor"], [C, "carol@flowers.com.au", "customer"]]) {
    await db.query("insert into auth.users values ($1,$2)", [id, email]);
    await db.query("insert into public.users (id,email,role) values ($1,$2,$3)", [id, email, role]);
  }

  async function as<T>(user: string, fn: () => Promise<T>, { aal = "aal2" } = {}): Promise<T> {
    await db.exec("reset role");
    if (user === "anon") {
      await db.exec(`set role anon; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','{"role":"anon"}',false);`);
    } else {
      const email = (await db.query("select email from auth.users where id=$1", [user])).rows[0].email;
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, email, role: "authenticated", aal })]);
      await db.exec("set role authenticated");
    }
    try { return await fn(); } finally { await db.exec("reset role"); }
  }
  async function err(p: Promise<unknown>): Promise<string> { try { await p; return ""; } catch (e) { return (e as Error).message; } }
  return { db, as, err, ADMIN, A, B, C };
}
