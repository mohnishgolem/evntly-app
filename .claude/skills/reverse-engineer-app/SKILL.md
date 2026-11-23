---
name: reverse-engineer-app
description: Analyse a public website or web app (layout, design tokens, components, user journeys, observable network traffic and frontend tech), compare it feature-by-feature with Evntly's codebase, rank improvements, and — only after Sai approves — build original implementations on a separate branch with tests and a PR. Use for "reverse engineer <url>", "how does Fresha/Airbnb/Easy Weddings do X", "competitor UX teardown", "gap analysis against <site>". Invoke as /reverse-engineer-app <URL>.
argument-hint: "<URL> [focus area, e.g. 'vendor onboarding']"
---

# Reverse-engineer an app (Evntly edition)

Target: **$ARGUMENTS**

If no URL was given, ask for one (and optionally a focus area) and stop.

The goal is to **understand how a product works and why it converts**, then build
*Evntly's own* version of the useful ideas. It is never to clone a site.

Skill directory (scripts, templates, references): `${CLAUDE_SKILL_DIR}` —
if that variable is empty, use `.claude/skills/reverse-engineer-app` in the repo root.
Below it is written as `$SKILL`.

## Non-negotiable rules

1. **Original work only.** Never copy source code, CSS, copy-text, branding, logos,
   images, icons, fonts, illustrations or other protected assets. Re-express ideas
   (a pattern, a flow, an information hierarchy) in Evntly's design system and
   Evntly's words.
2. **Public or authorised access only.** No bypassing logins, paywalls, captchas,
   rate limits, bot protection, geo-blocks or robots.txt. If a page needs an account,
   stop and record "not inspected — requires login" unless Sai provides an account
   *Sai owns* (see "Authorised sessions"). Never type passwords yourself; never create
   accounts on third-party sites; never submit enquiry/booking/contact forms on a
   competitor (it reaches real businesses).
3. **Human pace.** ≤ 20 page loads per site per session, ≥ 10 s between pages. Respect
   any crawl-delay. The capture script enforces robots.txt — do not override it for
   third-party sites.
4. **Evidence labels on every finding:** `VERIFIED` (seen in screenshot/DOM/network
   capture, with file reference), `INFERRED` (reasoned from evidence, say from what),
   `UNKNOWN`. Backend architecture, databases, pricing logic, ranking algorithms and
   anything server-side are **never** `VERIFIED` from browser inspection — at most
   `INFERRED`.
5. **Protect Evntly.** Preserve existing functionality and design consistency. No
   deploys, no production Supabase writes, no migrations, no Vercel changes, no
   pushes to `main`, no merges without Sai's explicit approval for that specific action.
6. **Privacy.** Don't capture or store personal data of competitor users/vendors beyond
   what's needed to describe a UI (e.g. "card shows vendor name, rating, price") —
   redact names/faces in notes. Captures stay local (gitignored).

Read `$SKILL/references/guardrails.md` before Phase 1 on any new site.

## Setup (once per machine, ~20 s)

```bash
node $SKILL/scripts/doctor.mjs        # checks Node, Chrome, playwright-core, git, gh
bash $SKILL/scripts/setup.sh          # installs playwright-core into $SKILL/scripts only
```

Scripts use the installed **Google Chrome** (`channel: chrome`) — no browser download,
and nothing is added to Evntly's `package.json`. If `doctor` reports git is blocked by
the Xcode licence, tell Sai to run `sudo xcodebuild -license` (Phases 6–7 need git).

## Phase 1 — Inspect the reference app

1. Create the analysis folder (prints its path; the whole folder is gitignored, because the
   repo is public and reports can quote production numbers):
   ```bash
   node $SKILL/scripts/init-analysis.mjs "<URL>" --focus "<focus or 'general'>"
   ```
   → `docs/reverse-engineering/<host>-<date>/` with the five report templates.
2. **Access gate. Do this before any capture or Claude-driven browsing.** Read
   robots.txt and the site's terms of use (footer link: "Terms of use/service"). You may
   open these with one `curl` or one browser page load each, unless robots.txt disallows
   the terms page; in that case Sai reads it. Record the result in *Access & permissions*,
   then:
   - **Terms ban reverse-engineering or accessing the site to build a competing or similar
     product** (e.g. Fresha) → **STOP.** Write the decision into the report, delete any
     captures already taken, and give Sai the options in `references/guardrails.md`.
   - **Terms ban bots, scripts or automated access** (e.g. Airbnb) → no scripts *and* no
     Claude-driven browsing (that is automated too). Use **screenshot mode** only.
   - **Silent or permissive** → continue. robots.txt never overrides the terms.
   - **Can't tell** → ask Sai before continuing.

   **Screenshot mode:** Sai browses the site by hand and saves screenshots (desktop and
   phone) into `<analysis>/captures/manual/`, named by step (e.g. `03-pricing-mobile.png`).
   Claude analyses only those images. Each finding is labelled VERIFIED (screenshot
   *file*) or INFERRED. There is no network or tech data. For a screen recording, pull stills
   with `node $SKILL/scripts/extract-frames.mjs <video> --out <analysis>/captures/manual/<name> --every 2`
   (uses Chrome; no ffmpeg needed).

   Screenshot mode only fixes a ban on *bots*. If the terms ban accessing the site *to build
   similar products* (e.g. Fresha), hand-made screenshots and recordings are covered too:
   don't analyse them. Delete any extracted frames, and say why.
3. Capture each key public page (start page + up to ~8 pages relevant to the focus):
   ```bash
   node $SKILL/scripts/capture.mjs "<page URL>" --out <analysis>/captures --label <short-name>
   ```
   Per page you get, for desktop (1440), tablet (834) and mobile (390):
   full-page + above-the-fold PNGs, and `capture.json` / `summary.md` with design
   tokens (colour/type/spacing/radius/shadow frequencies, CSS variables), landmarks,
   headings, CTAs, forms (labels/types only), repeated components, motion, sticky
   elements, network summary (hosts, resource types, API-looking paths with query
   *keys* only), response headers and tech fingerprints.
4. Look at the screenshots (Read the PNGs) — numbers alone miss hierarchy and feel.
   Scripts never click cookie/consent banners; if one hides content, use the built-in
   browser and choose the most privacy-preserving option (decline non-essential).
5. For interactions the script can't reach (menus, filters, carousels, date pickers,
   multi-step flows), use the **built-in browser** (`mcp__Claude_Browser__*`):
   `navigate`, `read_page`, `computer` (click/hover/scroll), `read_network_requests`,
   screenshots per step. Stop at any step that would create an account, send a message,
   submit a booking/quote/payment, or reach a login wall. Record each step.

## Phase 2 — Document features and journeys

Fill `REVERSE_ENGINEERING_REPORT.md` and `UI_COMPONENT_MAP.md` from the captures.
For Evntly, cover the focus areas in `$SKILL/references/evntly-context.md`
(vendor acquisition & onboarding, sign-up, profiles & portfolios, search, filtering &
discovery, booking & quote requests, messaging, reviews, vendor and customer dashboards,
navigation, mobile UX, conversion).
Map each journey as numbered steps with screenshot references, friction points and
persuasion devices (social proof, urgency, defaults, progress indicators, trust
signals). Fill the *Likely data structures* section: entities the UI implies
(vendor, package, quote, booking, review, message thread…), their visible fields and
relationships, using field names from JSON the page itself loaded (`capture.json →
network.jsonShapes`) — never replay or modify requests. Mark every claim VERIFIED / INFERRED / UNKNOWN.

## Phase 3 — Compare with Evntly

1. Read `$SKILL/references/evntly-context.md` for the route/component map, then open
   the actual Evntly files for each area (don't rely on the map being current).
2. Capture Evntly's equivalent pages for a like-for-like view. Prefer local dev
   (`preview_start` with name `evntly-isolated`, a dev server on port 3100 with Supabase
   unreachable, then `capture.mjs http://localhost:3100/<path> --label evntly-<name>`).
   Don't use `evntly-dev` for checks: it shares the production database. Production
   (`https://evntly…`) is fine for public pages, read-only.
3. Fill `FEATURE_COMPARISON.md`: one row per feature — reference behaviour, Evntly
   today (with file paths), gap, evidence label.

## Phase 4 — Recommend, ranked

In `IMPLEMENTATION_PLAN.md`, list improvements with **Impact** (1–5: effect on vendor
sign-ups / completed listings / quote requests / bookings), **Complexity** (1–5: files,
schema changes, risk), **Score = Impact × (6 − Complexity)**, sorted by score. For each:
the Evntly-native design (tokens/components it reuses), files to touch, whether it
needs a Supabase migration (flag — separate approval), tests to add, and how success
would be measured with existing `funnel_events` / `page_views`.

Then publish nothing and change no code. Summarise the top items to Sai.

## Phase 5 — Stop for approval

**Wait.** Ask Sai which items (by number) to implement. Do not start Phase 6 on a vague
"looks good" — confirm the exact list. Migrations, new dependencies and anything touching
payments, auth or RLS need to be named explicitly in the approval.

## Phase 6 — Implement on a separate branch

1. `git status` must be clean or Sai must OK carrying the changes. Branch from the
   current default: `git switch -c re/<host>-<short-feature>`.
2. Before writing Next.js code, read the relevant guide in
   `node_modules/next/dist/docs/` (this is a newer Next.js with breaking changes — see
   AGENTS.md).
3. Build with Evntly's system (`$SKILL/references/evntly-context.md`): existing
   `src/components/ui/*` primitives, CSS variables / Tailwind tokens from
   `src/app/globals.css`, coral `--primary` used sparingly, black/white/`#f5f5f7`
   neutrals, rounded-full buttons, 44 px touch targets, dark mode parity. No new
   colours, fonts or UI libraries without approval.
4. Small, reviewable commits. Add/extend Vitest tests in `tests/unit` alongside
   the change.
5. Migrations: write the SQL file under `supabase/` only; **never apply** it. Sai applies.

## Phase 7 — Test and open a PR

Run and record everything in `TEST_RESULTS.md` (commands, pass/fail, numbers —
report failures honestly, with output):

```bash
npm run typecheck
npm run lint
npm test
node $SKILL/scripts/responsive-check.mjs http://localhost:3100/<changed paths…> --out <analysis>/captures/responsive
node $SKILL/scripts/compare-visual.mjs <before.png> <after.png> --out <analysis>/captures/diff-<name>.png
```

- `responsive-check` flags horizontal overflow, tap targets < 24 px (and < 44 px
  advisory), text < 12 px, images without alt, missing `h1`, console/page errors and
  failed same-origin requests at all three viewports, light **and** dark.
- `compare-visual` is for Evntly before/after regression (capture `before` on the base
  branch first). Never use it to make Evntly pixel-match a competitor.
- Also verify the changed flow by hand in the built-in browser and screenshot it, on
  desktop **and** mobile (`resize_window` preset `mobile`).
- **Deployment gate:** only write "ready to deploy" in `TEST_RESULTS.md` / the PR when
  typecheck, lint, tests and the desktop + mobile browser checks all pass. Otherwise list
  what failed. The recommendation is Sai's to act on — never deploy.

Then, with Sai's go-ahead to push: `git push -u origin <branch>` and
`gh pr create --base main` with a body summarising: source analysis folder, items
implemented (with plan numbers), screenshots, test results, anything left out, and any
migration that still needs applying. Never merge, never deploy.

## Outputs checklist (per analysis)

`docs/reverse-engineering/<host>-<date>/`
- `REVERSE_ENGINEERING_REPORT.md` — what the app does, journeys, tech, evidence
- `FEATURE_COMPARISON.md` — reference vs Evntly, gaps
- `UI_COMPONENT_MAP.md` — reference components → Evntly equivalents / new components
- `IMPLEMENTATION_PLAN.md` — ranked recommendations + approval record
- `TEST_RESULTS.md` — filled in Phase 7 (or "not started — awaiting approval")
- `captures/`: screenshots + JSON

The whole folder is gitignored. Never commit competitor assets or reports with Evntly's
production figures: the repo is public. Share a report with Sai as a file or a private page.

## Authorised sessions (optional)

Only for an account **Sai owns** on that site (e.g. Sai's own vendor account on a
competitor, or an Evntly test vendor). Sai types the credentials:

```bash
node $SKILL/scripts/save-session.mjs "<login URL>" --name <host>
```

A visible Chrome opens; Sai logs in, then closes the window. Session state is stored at
`~/.claude/reverse-engineer-app/sessions/<host>.json` (mode 600, outside the repo).
Use it with `capture.mjs … --session <host>`. Read-only browsing only — never change
settings, send messages or create content in that account. Delete the file when done.
