# Reverse-engineering report — {{HOST}}

- **Reference:** {{URL}}
- **Focus:** {{FOCUS}}
- **Date:** {{DATE}}
- **Analyst:** Claude Code (`/reverse-engineer-app`), for Evntly
- **Evidence labels:** VERIFIED (observed, cite capture) · INFERRED (reasoned, state evidence) · UNKNOWN

## 1. Access & permissions

| Check | Result | Evidence |
|---|---|---|
| robots.txt for inspected paths | | |
| Terms of use on automated access / screenshots | | |
| llms.txt / AI directives | | |
| Pages requiring login (not inspected) | | |
| Authorised account used? (whose, read-only) | No | |

Pages inspected (≤ 20, ≥ 10 s apart):

| # | Label | URL | Captures |
|---|---|---|---|
| 1 | | | `captures/<label>/` |

## 2. Executive summary

<!-- 5–8 bullets: what this product does well that matters for Evntly's goals
     (vendor sign-ups, completed listings, quote requests, bookings). -->

## 3. Visual design

| Aspect | Observation | Label | Evidence |
|---|---|---|---|
| Layout & grid (max width, columns, density) | | | |
| Spacing scale | | | |
| Typography (families, scale, weights) | | | |
| Colour (neutrals, accent use, semantic) | | | |
| Radius / elevation / borders | | | |
| Imagery style | | | |
| Motion & micro-interactions | | | |
| Responsive behaviour (desktop → tablet → mobile) | | | |

## 4. Features & user journeys

<!-- One subsection per journey relevant to the focus. Evntly focus areas:
     vendor acquisition & onboarding · vendor profiles & portfolios · search & discovery ·
     booking & quote requests · customer reviews · vendor dashboards · mobile UX · conversion -->

### 4.1 <Journey name>

| Step | What the user sees / does | Friction | Persuasion / trust devices | Label | Evidence |
|---|---|---|---|---|---|
| 1 | | | | | |

Stopped at: <!-- e.g. "account creation — not submitted" -->

## 5. Conversion devices

| Device (social proof, urgency, defaults, progress, guarantees, pricing anchors…) | Where | Label | Evidence |
|---|---|---|---|

## 6. Frontend technology & observable network

| Finding | Label | Evidence |
|---|---|---|
| Framework | | `capture.json → tech` |
| Hosting / CDN (edge only) | | response headers |
| Third-party services (analytics, maps, payments, chat, A/B) | | network hosts |
| API style (REST/GraphQL paths seen; no replay) | | network `apiLike` |
| Image/CDN pipeline | | |

## 7. Likely data structures (INFERRED)

> Reconstructed from what the UI shows and from shapes of public JSON responses the page itself loaded (field names only — no replaying requests, no personal data). Use Evntly naming when mapping.

| Entity (as the UI implies) | Fields visible / implied | Relationships | Evntly table it maps to | Label | Evidence |
|---|---|---|---|---|---|

## 8. Backend & architecture — assumptions only

> Nothing in this section can be verified from the browser. Each item is INFERRED or UNKNOWN.

| Topic | Assumption | Basis | Confidence |
|---|---|---|---|

## 9. Open questions / not inspected

-
