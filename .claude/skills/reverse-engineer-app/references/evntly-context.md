# Evntly context for comparisons

Snapshot written 23 Nov 2026. **Verify against the code before relying on any path** —
routes and components move.

## Product

Event-vendor marketplace for Sydney (photographers, DJs, decorators, celebrants, venues,
florists, caterers, cakes & desserts, videographers, MCs, makeup artists, event planners).
Customers plan events and request quotes; vendors list services, respond, get booked.
Stack: Next.js 16 (App Router, newer than training data — read `node_modules/next/dist/docs/`),
React 19, Tailwind v4, shadcn-style primitives on `@base-ui/react`, Supabase (auth, Postgres,
RLS, storage), Stripe, Resend, Vercel. Production: `https://evntlyapp.com`. Local dev:
`.claude/launch.json` → `evntly-isolated` on port 3100 for checks
(Supabase unreachable, dummy Stripe test keys; added with PR #84). `evntly-dev` on port 3000 shares
the production Supabase: read-only browsing only, no test writes without approval.

## Design system (source of truth: `src/app/globals.css`, `src/components/ui/*`)

- **Feel:** minimal, Apple-like. Crisp white (light) / `#101014` (dark) backgrounds, black
  text `#1d1d1f`, one neutral grey `#f5f5f7` for grouped sections, muted text `#6e6e73`.
- **Accent:** single coral `--primary: #e8604a` (hover `#d4523c`), focus ring coral 40%.
  Used sparingly: primary CTAs, selected states. Don't introduce other accent colours.
  `--champagne` gold is only for star ratings. `--destructive`, `--success`, `--warning` exist.
- **Type:** system SF stack (`-apple-system, "SF Pro Text"…`), no web fonts.
- **Radius:** `--radius: 1.375rem` (~22 px) → large rounded cards; buttons `rounded-full`.
- **Surfaces:** flat opaque cards; "glass" (`.glass-material`) only for header and modal overlays.
- **Buttons:** `src/components/ui/button.tsx` (cva variants default/outline/secondary/ghost/
  destructive/link; size `lg` = 44 px for primary touch actions). Press scale 0.97.
- **Primitives:** avatar, badge, button, calendar, card, checkbox, dialog, dropdown-menu, input,
  label, popover, progress, select, separator, sheet, skeleton, switch, tabs, textarea.
- **Icons:** `lucide-react`. **Dark mode:** `.dark` class on `<html>`; every change needs parity.
- **Breakpoints:** Tailwind defaults + custom `desk` variant (≥ 1200 px: persistent sidebars).
- **Mobile:** `src/components/site/mobile-tab-bar.tsx`, `nav-drawer.tsx` (always-dark drawer).

## Route / component map by focus area

| Focus area | Evntly routes | Key components / libs |
|---|---|---|
| Vendor acquisition & onboarding | `/founding-vendors`, `/founding-vendors/claim`, `/vendor-signup`, `/vendor-dashboard/finish`, `/vendor-dashboard/beta` | `vendor-signup-wizard.tsx`, `components/founding/*`, `listing-completion.tsx`, `lib/listing-completion.ts`, `lib/onboarding.ts`, `lib/founding/*` |
| Vendor profiles & portfolios | `/vendor/[id]`, `/vendor-dashboard/profile`, `/portfolio`, `/edit`, `/business`, `/pricing` | `portfolio-gallery.tsx`, `portfolio-uploader.tsx`, `vendor-pricing.tsx`, `pricing-fields.tsx`, `founding-badge.tsx`, `lib/profile-completeness.ts`, `lib/pricing-model.ts` |
| Search & discovery | `/explore`, `/sydney/[category]`, `/` | `explore-filters.tsx`, `explore-results.tsx`, `vendor-card.tsx`, `vendor-map*.tsx`, `suburb-picker.tsx`, `lib/search-term.ts`, `lib/matching/*`, `lib/seo.ts` |
| Booking & quote requests | `/plan`, `/dashboard/quotes`, `/bookings`, `/vendor-dashboard/quotes`, `/enquiries`, `/bookings` | `request-quote.tsx`, `quote-*.tsx`, `vendor-quote-*.tsx`, `contact-vendor.tsx`, `book-bundle-form.tsx`, `lib/booking-intent.ts`, `lib/payments/*`, `lib/quote-expiry.ts` |
| Customer reviews | `/vendor/[id]` (reviews section) | `leave-review.tsx`, rating display in `vendor-card.tsx` |
| Messaging | `/messages` | `message-thread.tsx`, `group-chat.tsx`, `lib/messages.ts`, `lib/contact-reveal.ts` (contact masking) |
| Vendor dashboards | `/vendor-dashboard/*` (bookings, calendar, earnings, enquiries, event-feed, opportunities, payouts, quotes, bundles, google) | `dashboard-nav.tsx`, `earnings-chart.tsx`, `vendor-calendar.tsx`, `calendar-sync.tsx`, `listing-pause-toggle.tsx` |
| Customer dashboard / events | `/dashboard/*`, `/plan` | `event-board/*`, `event-stage-tracker.tsx`, `event-task-list.tsx`, `budget-tracker.tsx` |
| Conversion instrumentation | — | `lib/funnel-events.ts`, `lib/page-views.ts`, `page-view-tracker.tsx`, `founding/funnel-ping.tsx`, `lib/meta-pixel.ts`, `lib/meta-capi.ts` |

## What competitors to look at for what

| Competitor | Most useful for |
|---|---|
| Fresha (fresha.com) | ⛔ **Do not analyse.** Its terms of use (read 23 Nov 2026) ban reverse-engineering or accessing the site to build a competing or similar product, and ban automated scripts. Use third-party sources only |
| Airbnb (airbnb.com) | Search & map discovery, listing page hierarchy, photo galleries, trust/reviews, host onboarding (public "become a host" pages) — ⚠️ its terms (read 23 Nov 2026) ban bots, crawlers and automated access, so **screenshot mode only** |
| Easy Weddings (easyweddings.com.au) | AU event-vendor directory norms, category pages, enquiry flows, vendor advertising pitch. robots.txt disallows `/reviews/supplier/`, `/wedding/enquiry/`, `/business/`, `/api/`, `/webapi/`, `/people/`, `/mysuppliers/`; crawl-delay 10 s (checked 18 Nov 2026 — recheck) . Terms are at `/business/legal/` (robots-disallowed), so Sai must read them before any analysis |

## Measuring success (for the plan)

Use what already exists: `funnel_events` (vendor funnel steps), `page_views`,
`beta_applications.source/campaign`, listing completion gate. Verified vendor numbers come from
the `evntly-acquisition-truth` skill — never quote counts from elsewhere.

## Hard limits (from `.claude/skills/README.md` and `SECURITY.md`)

Migrations, code deploys and DB imports each need separate approval. Production Supabase is
shared by local dev. Nothing is sent, published, spent or deployed without Sai's approval.
