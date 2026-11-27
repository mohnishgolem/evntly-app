# Read-only database access for `evntly-vendor-acquisition`

Written 26 Nov 2026. **Sai approved option A the same day.** A1 (token) and A3
(activation test) are now **done and independently verified** (section below).
Not committed. No migration or database write.

## Independent verification (26 Nov 2026, main session)

All checks used GET requests or `SELECT` only. The token was read from the
Keychain into a variable and never printed.

| Check | Result | Evidence |
|---|---|---|
| A1: token in Keychain | PASS | `security find-generic-password -s evntly-supabase-agent-ro` returns a 44-char `sbp_` token without a prompt from an app-started session |
| Token cannot list projects or orgs | PASS | `GET /v1/projects` 403 (missing `projects_read`); `GET /v1/organizations` 403 |
| Token cannot read project admin data | PASS | project details, API keys, Edge Function secrets, auth config, functions, branches: all 403 |
| Token cannot reach the other project (`evntly-staging`) | PASS | project GET and database query both 403 |
| **Token is read-only on its own, without the `read_only` URL flag** | PASS | `POST /database/query` (not the read-only endpoint) runs as `supabase_read_only_user`, `transaction_read_only=on`. The token is the enforcement; the URL flag is a second layer |
| A3: activation test claims match the raw transcript | PASS | Subagent transcript `a3851735…/subagents/agent-ac39ac152e4ca6685.jsonl`: B refused by the hook (verbatim), C `supabase_read_only_user`/`on`, D `25006 cannot execute lo_create() in a read-only transaction`, E six files returned rows. The agent made 9 SQL calls (all listed), wrote 1 file (the result), and used no other tool with side effects |
| No write-capable connector inherited | PASS | The agent's recorded tool list: Read, Write, Edit, WebSearch, WebFetch, Skill, Grep, Glob, 4 `supabase-ro` tools, SubagentHandback. No Gmail, Chrome, Vercel, Canva, Metricool or `mcp__852e9dda…` tools |
| Why `list_extensions` and `list_migrations` appeared | Explained | Claude Code gives a subagent **every** tool of a server defined inline in its `mcpServers`, whatever `tools:` lists. The Supabase server's `database` feature group is `list_tables`, `list_extensions`, `list_migrations`, `execute_sql`, `apply_migration`; read-only mode drops `apply_migration`. Both extras are catalog reads. `apply_migration` and `deploy_edge_function` are now also in the agent's `disallowedTools` in case the server ever exposes them |
| Keychain in the scheduled-task environment | **Partly verified** | Works in an app-started, non-interactive background session (the activation run). Creating a separate scheduled check task was refused by the permission classifier, so the 09:13 run's own preflight is the test: it fails closed and reports if Keychain access fails (e.g. Mac locked with a locked keychain) |

### Effective database permissions of `supabase_read_only_user` (catalog, read-only)

- Not superuser; no createrole/createdb/replication; **bypasses RLS**; login
  default `default_transaction_read_only=on`; member of `pg_read_all_data`,
  `pg_monitor`. Cannot `CREATE` in any schema.
- Write privileges it holds (via `PUBLIC`): `net.http_request_queue` and
  `net._http_response` (all), `cron.job_run_details` (delete). Blocked by the
  read-only transaction; also blocked by the guard (`net.`/`cron.` denied).
- Executable volatile `SECURITY DEFINER` functions:
  `enforce_listing_complete_on_approval`, `keep_draft_applications_started`.
  Both return `trigger`, so they can't be called directly.
- **Can read secrets.** `vault.decrypted_secrets` (0 secrets today),
  `public.app_settings` (holds `cron_secret`), `auth.users.encrypted_password`
  and auth tokens, `cron.job`. No agent SQL file uses any of these. **Fix
  applied:** the guard now refuses Vault, `app_settings`, password hashes,
  `*_token(s)` columns, `auth.sessions`/`identities`/MFA/SSO tables, `cron.`,
  `net.`, `pg_settings`, server-file functions, `SHOW` (except
  `transaction_read_only`) and `current_setting()` of anything except
  `transaction_read_only`. Tested: 18 attack queries refused; the 6 agent SQL
  files and the activation probes still allowed. This is still a text filter.
  The database-level fix is option B (custom role, migration, needs your
  approval).

### Other hardening added
- `.claude/hooks/agent-write-scope.py`: the agent can only write `.md`/`.csv`
  under `outreach/queue/`, `outreach/reports/`, `docs/ai-agents/test-results/`,
  `docs/ai-agents/pilot/`. Its own definition, hooks, settings, skills and app
  code are refused (path traversal tested). `Bash` is disallowed for the agent.
- `.claude/bin/ro-sql`: read-only SQL for the 09:13 report itself, on the same
  token. It checks the role before every run, applies the guard, and exits 2
  on a missing Keychain item, bad token (401) or wrong role. It never falls back
  to another credential. The report no longer uses the `postgres` connector.
- Mutating tests now use `evntly-staging` only (the agent token can't reach
  it, by design).

## Recommendation

Give the agent its own Supabase MCP connection with `read_only=true`, signed in
with a token scoped to **this project, Database: Read**. Keep the text guard as
a second layer. No migration is needed.

Approve: **A** (below). B (custom role) is only worth it if you also want to
limit *what the agent can read*.

## What was checked

| Finding | Source |
|---|---|
| The current connector runs agent SQL as `postgres` (can write, bypasses RLS) | Live query |
| Postgres 17.6. `supabase_read_only_user` exists: member of `pg_read_all_data` and `pg_monitor`, bypasses RLS, `default_transaction_read_only=on`, not superuser | Live catalog |
| That role has no write grant of its own on `public` or `auth`. It inherits `PUBLIC` write grants on `net.http_request_queue`, `net._http_response` and `cron.job_run_details` (delete) | Live catalog |
| `SECURITY DEFINER` functions it can execute: only `public.is_admin` and `public.is_active_combined_package`, both `STABLE` | Live catalog |
| The Supabase MCP server accepts `project_ref`, `read_only=true` and `features`. Read-only runs queries as a read-only Postgres user; `apply_migration` refuses | Supabase MCP docs and server source |
| Scoped access tokens can be limited to one project and Database: Read, which is enough for `execute_sql` and `list_tables`. They are in public alpha | Supabase token docs |
| Claude Code agent files accept an inline `mcpServers` entry, and `headersHelper` for the auth header. Inline servers load only in a trusted folder (this one is) | Claude Code sub-agents and MCP docs |

## Options compared

| Option | Stops a writing function called from `SELECT`? | Limits reads? | Cost |
|---|---|---|---|
| **A. Connector read-only mode** | Yes, the database refuses it | No: reads every schema, including `auth` | Config + one token |
| B. Custom role | Yes, by grants and read-only default | Yes, to the listed columns | Migration, password, a different MCP server, 4 SQL files edited |
| C. Function allowlist in the guard | Only for names it parses correctly | No | Not a permission; every new function needs an edit |

C is not recommended: the aim is to stop relying on text filtering.

---

## A. Exact change

### A1. Token (you do this; Claude never sees it)

1. Supabase dashboard → Account → Access Tokens → new **scoped** token. Name
   `evntly-agent-ro`, project `pzeosxtdulveuywhmkfe` only, permission
   **Database: Read** only, with an expiry date.
2. Store it in the macOS Keychain. With `-w` last, it prompts for the value, so
   the token stays out of shell history:

```bash
security add-generic-password -s evntly-supabase-agent-ro -a "$USER" -w
```

If your account does not offer scoped tokens yet, **do not use a classic token**
(it has full account access). Use A-fallback.

### A2. `.claude/agents/evntly-vendor-acquisition.md` frontmatter

```diff
-tools: Read, Grep, Glob, Write, Edit, WebSearch, WebFetch, Skill, mcp__852e9dda-c10c-4d4a-b4f0-90c8886ae0dd__execute_sql, mcp__852e9dda-c10c-4d4a-b4f0-90c8886ae0dd__list_tables
+tools: Read, Grep, Glob, Write, Edit, WebSearch, WebFetch, Skill, mcp__supabase-ro__execute_sql, mcp__supabase-ro__list_tables
+mcpServers:
+  - supabase-ro:
+      type: http
+      url: "https://mcp.supabase.com/mcp?project_ref=pzeosxtdulveuywhmkfe&read_only=true&features=database"
+      headersHelper: 'printf ''{"Authorization":"Bearer %s"}'' "$(security find-generic-password -s evntly-supabase-agent-ro -w)"'
 model: sonnet
 skills: evntly-acquisition-truth, evntly-pipeline-tracker, evntly-listing-followup, evntly-outreach-drafter, evntly-lead-finder, evntly-competitor-scan, humanizer
 hooks:
   PreToolUse:
-    - matcher: "mcp__852e9dda-c10c-4d4a-b4f0-90c8886ae0dd__execute_sql"
+    - matcher: "mcp__supabase-ro__execute_sql"
```

**The `matcher` line must change with the `tools` line.** Otherwise the guard
silently stops running.

The guard script, `.claude/settings.json` and the main session's connector stay
as they are, so `record_event.sql` still runs from the main session.

### A-fallback (no scoped tokens): OAuth

Create `.mcp.json` in the repo root:

```json
{
  "mcpServers": {
    "supabase-ro": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=pzeosxtdulveuywhmkfe&read_only=true&features=database"
    }
  }
}
```

In A2, replace the inline block with `mcpServers:` followed by `  - supabase-ro`,
then run `claude mcp login supabase-ro` in a terminal in this folder. The main
session will see this server too. Enforcement then rests on the `read_only=true`
URL alone, not on the token.

### A3. Verify in a new session

Update `ACTIVATION-TEST.md` with these, and do not let the 09:13 report
dispatch the agent until all pass.

| # | Agent runs | Pass |
|---|---|---|
| 1 | `select current_user, current_setting('transaction_read_only')` | `supabase_read_only_user`, `on` |
| 2 | `select pg_catalog.lo_create(0)` (the guard allows it, so the database must refuse) | Error: read-only transaction. If it returns a number, it failed: remove that empty large object from the main session and roll back |
| 3 | `select 1; select 2` | Refused by the guard, proving the new matcher fires |
| 4 | The six read-only files: `verified_vendors`, `daily_by_source`, `incomplete_listings`, `dedupe_candidates`, `priority_queue`, `lead_to_vendor_matches` | All return without permission errors |
| 5 | Check the agent's tool list | No `mcp__852e9dda…` tool |

Rollback: revert the agent file and revoke the token.

### Previously unverified (now settled)

- `read_only=true` uses `supabase_read_only_user`: confirmed (test C).
- A Database: Read token without the `read_only` flag: still
  `supabase_read_only_user`, read-only on. Confirmed.
- Keychain in the scheduled 09:13 run: see the verification table above
  (fails closed if it doesn't work).

### What remains open after A

- **`PUBLIC` grants.** The `pg_net` queue is writable by any role, and a queued
  row makes the database send an HTTP request. A read-only transaction blocks
  this, but read-only is a session setting rather than a missing grant, and a
  multi-statement query might be able to turn it off (not tested, as it needs a
  write attempt). The guard blocks multiple statements, so keep it. Revoking the
  grants could break app features that use `pg_net` and is out of scope.
- **Broad reads.** The role can read `auth.users` (including password hashes),
  `cron.job` commands and all customer data. Today's access can too. B fixes it.
- **Self-edit.** The agent has `Write` and `Edit`, so it could change its own
  agent file or the guard. The scoped token still limits the database side, but
  review diffs under `.claude/`.

---

## Phase 2 marketing grants (26 Nov 2026, Sai approved "apply grants")

Migration `20261130120000_agent_readonly_marketing_grants` is **applied to
production**; rollback in `supabase/rollbacks/`. It was tested first on local QA
in a rolled-back transaction.

| Check (production) | Result |
|---|---|
| Readable as `evntly_agent_ro` | `quote_requests` status, event type and date, origin, share source, vendor and client ids, booking id, expiry, budget band, guests; `bookings` status, escrow, service, date, provider and client ids, value, commission; `page_views` kind, vendor, source, visitor id; `funnel_events` event, source, campaign, visitor id (110 column grants in total) |
| Still denied | `quote_requests.client_email`, `details`, `location`; `bookings.client_email`, `event_address`, Stripe ids; `funnel_events.detail`; `page_views.user_id`; any INSERT |
| KPI queries through the connector | all run, about 0.5–1.7 s each; a client email query is refused by the database |

## B. Status (26 Nov 2026, Sai approved "apply + connector")

| Step | State |
|---|---|
| Migration `20261130110000_agent_readonly_role` | **Applied to production.** Verified as `postgres` (SELECT only): role exists, can log in, read-only default, 3 connections, 75 column grants; no access to `app_settings`, `vault`, `auth`, `cron`, `users.phone`, `bookings`; no INSERT; `agent_read.auth_users` not visible to `anon`/`authenticated`; **no password yet** (nobody can log in) |
| SQL files switched to `agent_read.auth_users` | **Done** (verified_vendors, daily_by_source, incomplete_listings, lead_to_vendor_matches, full_funnel). All 7 files still run through `ro-sql` (17 accounts, same as before) |
| First-party connector `.claude/mcp/evntly_ro_db.py` | **Built and tested** against the role on the local QA stack (random local test password; role removed afterwards). MCP stdio, standard library only. Guard first, then `psql` from the local Supabase image in a `begin transaction read only` block, logging in as `evntly_agent_ro` via `aws-0-ap-southeast-2.pooler.supabase.com:5432` (cluster confirmed with a dummy login). Results: 4 real queries OK, 1–3 s each; secrets, multi-statement queries and writes refused by the guard; `users.phone` and `auth` refused by the database; `lo_create` refused by the read-only transaction; refuses with no Keychain item, and refuses the test password on a non-local host |
| Password | **Set 26 Nov.** Sai ran the script (Keychain `evntly-agent-ro-db`). Claude applied the matching SCRAM hash (the second run's; the first was superseded and never applied) at Sai's request. Only the hash went to Supabase |
| Connector on production | **Verified 26 Nov** (reads and denied reads only, no write probes): logs in as `evntly_agent_ro` with read-only on; all 7 SQL files run, about 0.5–1 s each, 17 accounts as before; the database refuses `users.phone`, `auth.users`, `bookings` and quote client emails; the guard refuses `app_settings` |
| Agent switched | **Done.** Frontmatter uses only `evntly-ro-db`; Step 0 expects `evntly_agent_ro`. **Activation test v3 passed** in a fresh session (raw transcript checked). The agent's only tools are Read, Write, Edit, WebSearch, WebFetch, Skill, Grep, Glob and `mcp__evntly-ro-db__execute_sql`. Results: B guard refused, C `evntly_agent_ro`/`on`, E six reads OK, G write refused, H `app_settings` refused, I `users.phone` refused by the database. The 09:13 gate is open |
| Password (original instructions) |  Run `.claude/bin/set-agent-db-password` in a terminal. It generates the password, stores it in the Keychain (`evntly-agent-ro-db`) and prints an `alter role … password 'SCRAM-SHA-256$…'` line to paste into the SQL editor. Only the hash reaches Supabase. The hash method was checked on local QA: the right password logs in, a wrong one is refused |
| Agent switch | **After the password.** Change the agent's `mcpServers` from `supabase-ro` to the stdio connector (below), the `tools:` and hook matcher to `mcp__evntly-ro-db__execute_sql`, and Step 0 to expect `evntly_agent_ro`; then run activation test v3 in a new session. Until then the agent stays on option A |

Agent frontmatter after the switch:

```yaml
tools: Read, Grep, Glob, Write, Edit, WebSearch, WebFetch, Skill, mcp__evntly-ro-db__execute_sql
mcpServers:
  - evntly-ro-db:
      type: stdio
      command: /usr/bin/python3
      args: ["-I", "/Users/saigolem/evntly-app/.claude/mcp/evntly_ro_db.py"]
hooks:
  PreToolUse:
    - matcher: "mcp__evntly-ro-db__execute_sql"   # same guard, second layer
```

Rollback: revert the agent file (back to option A), then run
`supabase/rollbacks/20261130110000_agent_readonly_role.down.sql` and revert
the 5 SQL files.

## B. Least-privilege role: test record

Files: `supabase/migrations/20261130110000_agent_readonly_role.sql` and
`supabase/rollbacks/20261130110000_agent_readonly_role.down.sql` (the final
versions; the draft below is superseded).

**Tested on the local `evntly-qa` Supabase stack** (Postgres 17.12, production
schema, no rows; `postgres` has the same attributes as production's:
CREATEROLE + BYPASSRLS, not superuser). Every run was inside a transaction that
ended in ROLLBACK, and no role or schema is left behind (checked).

| Check | Result |
|---|---|
| Migration applies | PASS. Role settings: `default_transaction_read_only=on`, `statement_timeout=15s`, `idle_in_transaction_session_timeout=30s` |
| All 7 agent SQL files run as the role (with `auth.users` → `agent_read.auth_users`) | PASS: verified_vendors, daily_by_source, incomplete_listings, dedupe_candidates, priority_queue, lead_to_vendor_matches, full_funnel |
| Secrets refused | PASS: `vault` (schema denied), `app_settings` (table denied), `auth.users` incl. password hashes, `auth.sessions` (schema denied), `cron.job` (schema denied) |
| Columns limited | PASS: `users.phone`, `select *` on providers, `bookings`, quote client emails and message contents all denied; listed columns readable |
| Writes refused by grants (even with read-only off) | PASS: insert/update/delete on prospects, events and providers; create table in `public` and `agent_read`; delete from `cron.job_run_details` |
| Rollback script | PASS, after a fix: on Postgres 16+ `postgres` administers the role but doesn't hold its privileges, so `drop owned by` failed until the script first runs `grant evntly_agent_ro to postgres`. Found when a broken first harness run left the role in the local QA database; removed with the fixed order |
| `lo_create` | **Allowed** by grants (every role can create large objects). The read-only default refuses it at login, but a session can turn read-only off. Impact: blob storage only, no data access. Not revocable by `postgres` |
| `net` schema | Not installed locally, so untested here. In production `net` is usable by every role and its queue tables are writable by every role, so like `supabase_read_only_user` this role is held back from them only by the read-only default. Same exposure as today, not worse. Fixing it means revoking `PUBLIC` grants on `pg_net`, which could break features |

**What B changes:** secrets, password hashes, auth tokens, cron, bookings,
messages and customer emails become unreadable. That's the gap A left open.

**Not done yet (each needs a decision):**
1. **Production apply.** A production schema change, so it needs your
   explicit go-ahead. Then you set the password yourself (`alter role
   evntly_agent_ro password '…'` in the SQL editor) and store it in the
   Keychain (`security add-generic-password -s evntly-agent-ro-db -a "$USER" -w`).
2. **How the agent connects.** The hosted Supabase connector can't log in as a
   custom role, and this Mac has no Postgres client. Options:
   - **(recommended) A small first-party connector**, about 150 lines of Python
     standard library in this repo. It's a stdio MCP server exposing one
     `execute_sql` tool that applies the guard, then runs the query with `psql`
     from the Supabase Postgres image already on this Mac (`docker run --rm`,
     no new download), logging in as `evntly_agent_ro` through Supabase's
     session pooler with the Keychain password. No third-party code. Needs
     Docker Desktop running at 09:13; fails closed if it isn't.
   - A third-party Postgres MCP server: needs vetting and your approval as
     third-party code.
   - Install `psql` via Homebrew (not installed): new tooling.
3. **SQL file switch.** At production apply, 5 files change `auth.users` to
   `agent_read.auth_users` (verified_vendors, daily_by_source,
   incomplete_listings, lead_to_vendor_matches, full_funnel). The main session
   and `ro-sql` can still run them. Not changed yet, because the view doesn't
   exist in production and tomorrow's 09:13 run would break.

Until then the agent keeps using option A (scoped token +
`supabase_read_only_user` + secrets guard), which is in force now.

### Superseded draft (kept for history)

The Supabase connector always uses its own role, so this role needs a direct
Postgres connection through a separate MCP server. None has been chosen or
vetted, which is the main reason B is not recommended now. `SET ROLE` inside
agent SQL is not a substitute: the query can reset it.

Proposed `supabase/migrations/20261130110000_agent_readonly_role.sql`
(untested):

```sql
-- Least-privilege login for the vendor acquisition agent.
-- Set the password separately (never in a migration):  \password evntly_agent_ro
create role evntly_agent_ro with login bypassrls noinherit connection limit 3;
alter role evntly_agent_ro set default_transaction_read_only = on;
alter role evntly_agent_ro set statement_timeout = '15s';

-- postgres cannot grant USAGE on schema auth, so expose only what the SQL
-- files read through a view owned by postgres, outside the API schemas.
create schema agent_read;
create view agent_read.auth_users as
  select id, email_confirmed_at,
         jsonb_build_object('full_name', raw_user_meta_data->>'full_name',
                            'name', raw_user_meta_data->>'name') as raw_user_meta_data
  from auth.users;
revoke all on agent_read.auth_users from public;
grant usage on schema agent_read, public to evntly_agent_ro;
grant select on agent_read.auth_users to evntly_agent_ro;

grant select (id, email, role, created_at) on public.users to evntly_agent_ro;
grant select (id, owner_user_id, name, service_type, status, social_link, is_demo)
  on public.service_providers to evntly_agent_ro;
grant select (provider_id) on public.portfolio_items to evntly_agent_ro;
grant select (provider_id, active) on public.vendor_packages to evntly_agent_ro;
grant select (user_id, source, campaign, status, decided_at)
  on public.beta_applications to evntly_agent_ro;
grant select (email_normalized) on public.vendor_waitlist to evntly_agent_ro;
grant select (provider_id, status) on public.listing_setup_requests to evntly_agent_ro;
grant select on public.vendor_prospects to evntly_agent_ro;
-- Read by the outreach-drafter skill's thread check, not by a .sql file.
grant select on public.vendor_prospect_events to evntly_agent_ro;
```

Rollback:

```sql
drop owned by evntly_agent_ro;
drop view agent_read.auth_users;
drop schema agent_read;
drop role evntly_agent_ro;
```

Also required: change `join auth.users au` to
`join agent_read.auth_users au` in `verified_vendors.sql`,
`daily_by_source.sql`, `incomplete_listings.sql` and
`lead_to_vendor_matches.sql` (the main session can still run them, as `postgres`
can read the view). `bypassrls` is deliberate: the column grants are the limit,
and the existing policies are written for app users. The same `PUBLIC` grants
noted above apply to this role.
