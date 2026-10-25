# Future Milestone Payment Framework

**STATUS: INACTIVE. Integrated payments are switched off (`app_settings.payments_enabled = 'false'`). This framework must not be activated until every approval in section 9 has been obtained.**

**DRAFT — prepared to support legal drafting and technical planning. Not legal or financial advice. Requires review by a practising Australian solicitor (financial services and payments) and an accountant before activation.**

Business: Sai Mohnish Golem trading as Evntly (ABN 49 193 658 959), sole trader, Sydney NSW.
Prepared: 24 October 2026.

---

## 1. What exists today (verified in code)

A Stripe Connect milestone-payment system was built and merged (migration `20261022090000_stripe_milestone_payments.sql`, `src/lib/payments/*`, `src/app/api/stripe/webhook`). It is dormant:

| Component | State |
|---|---|
| `payments_enabled` app setting | `false` |
| Stripe keys / webhook secrets in Vercel | Not set (per project notes) |
| Payment UI on bookings, payouts page | **Hidden** while disabled (legal-compliance branch) |
| `payment_plans` writes by users | **Blocked by DB trigger** while disabled (`guard_payment_plans_enabled`) |
| Payment plans in production | 0 |
| `payment_guard_mode` (off-platform payment talk) | `log` (flag only); `adminSetPaymentsEnabled(true)` switches it to `block` |
| `commission_bps` app setting | `700` — **a placeholder, not an approved business decision.** Must be approved and published in Vendor Agreement Schedule 1 before use. |

Designed money flow ("separate charges and transfers"):
1. Vendor proposes a plan: deposit + milestones, or full payment.
2. Customer agrees.
3. Customer pays each milestone by Stripe Checkout **into Evntly's Stripe balance**. Evntly is the merchant of record.
4. Vendor marks work submitted, with optional evidence in the private `milestone-evidence` bucket.
5. Customer approves, or the deposit is released when the vendor confirms the booking.
6. Evntly transfers the vendor's share (amount less commission) to the vendor's connected account. Stripe card fees come out of Evntly's commission.

**Key legal consequence:** in this design **Evntly holds customer funds** between payment and release. That is the reason for the licensing analysis in section 3.

## 2. Roles and responsibilities

| Party | Responsibilities |
|---|---|
| **Stripe (payment service provider)** | Card acquiring, card-data security (PCI DSS), Connect onboarding and KYC of vendors, payouts to vendors' banks, Radar fraud screening, dispute and chargeback processing with card schemes. Governed by the Stripe Services Agreement (Evntly) and the Stripe Connected Account Agreement (vendors). |
| **Evntly (platform)** | Merchant of record for customer charges; holds the platform balance until release; decides release and refund according to published rules; bears chargeback liability first (it may recover from the vendor by transfer reversal where the agreement permits); customer support and complaints; record-keeping; compliance with any licence or exemption conditions. |
| **Vendor** | Completes Stripe onboarding with accurate identity and bank details; delivers the services; issues the tax invoice for the services; refunds or remedies under the ACL; agrees to transfer reversals for refunded or charged-back amounts (to be written into the Vendor Agreement). |
| **Customer** | Pays milestones; reviews and approves work in good faith within a set period; raises disputes through the process. |

## 3. Regulatory analysis required before activation (solicitor)

1. **Financial services licensing (Corporations Act 2001 Pt 7.1).** Holding customer funds for later release to a third party may be a *non-cash payment facility*, which is a financial product requiring an AFSL unless an exemption or ASIC relief applies. Possible routes to evaluate:
   - ASIC relief for certain payment facilities;
   - the "agent of the payee" structure (customer payment to the platform as the vendor's agent discharges the customer's debt);
   - using Stripe **destination charges** or **direct charges**, so the vendor is merchant of record and Evntly doesn't hold funds;
   - partnering with a licensed escrow or payment-facilitation provider.
2. **Payments System Modernisation reforms.** Treasury's payment service provider licensing reforms (Treasury Laws Amendment (Payments System Modernisation) Bill 2025 and Tranche 1 regulations consulted in March–April 2026) bring *stored-value facilities* and *payment facilitation services* into AFSL licensing, with safeguarding of client money. Confirm the commencement dates and whether Evntly's model is captured, or excluded (for example as an incidental or low-value facility).
3. **AML/CTF.** Confirm whether any designated service under the *AML/CTF Act 2006* (as amended in 2024, with Tranche 2 from 2026) is provided. It is likely not, if Stripe performs the regulated functions, but this needs confirming.
4. **Consumer protection.**
   - ACL: no misleading "secure" or "protected" claims. Consumer guarantees still apply to vendors.
   - The ePayments Code (being made mandatory under the reforms).
   - RBA surcharging rules, if any surcharge is passed on.
   - Unfair contract terms in the release and refund rules.
5. **Tax.**
   - GST registration once Evntly's GST turnover reaches $75,000. Commission is a taxable supply by Evntly, so it needs tax invoices.
   - **Sharing Economy Reporting Regime:** confirm whether Evntly is a reporting electronic distribution platform for transactions made through it. This applies to most platforms from 1 July 2024 and may apply even with direct payments.
6. **Privacy.**
   - Stripe as a new overseas recipient (US).
   - Payment metadata retention.
   - Privacy Policy update.

## 4. Milestone rules (to be approved and published)

| Topic | Proposed rule (needs approval) |
|---|---|
| Creation | Vendor proposes. Each milestone has a name, deliverables, amount and due date. Total equals the booking total. |
| Approval | Customer must agree before any charge. The vendor can't change an agreed plan without the customer's agreement. |
| Funding | Customer pays each milestone when due via Checkout. Unfunded milestones don't block other ones. |
| Customer confirmation | Customer approves submitted work, or requests changes with reasons. **Decision needed:** auto-approval after N days of customer silence (common, but must be fair and clearly disclosed). |
| Vendor confirmation | Vendor marks work started and submitted, with evidence. Deposit is releasable when the vendor confirms the booking. |
| Partial payouts | Each approved milestone is released separately. Partial refunds reduce the payout of the affected milestone only. |
| Disputed milestones | Either party can dispute a funded milestone. Funds stay held. Evntly reviews within a published SLA and releases, refunds or splits per published criteria. Parties keep their ACL and court/tribunal rights. |
| Refunds | Cancelled or unfunded work is refunded to the original payment method. Refunds after payout use a transfer reversal from the vendor's connected account. |
| Chargebacks | Evntly responds with evidence (plan agreement, approvals, messages). If lost, the amount is recovered from the vendor where the vendor was at fault. Repeated chargebacks lead to review or suspension. |
| Commission | Deducted from each payout at the rate in Schedule 1 that applied when the plan was agreed. Shown to the vendor before they propose. Never shown as a customer fee unless disclosed as such. **Rate not yet approved** (DB placeholder 700 bps). |
| Cancellation | Follows the vendor's agreed cancellation terms, the ACL and Evntly's Cancellation Policy v2. |

## 5. Payment security

- Card data is never handled by Evntly (Stripe Checkout, SAQ-A scope).
- Stripe ids, funding and payout status are written only by the server with the service role. Users can't write payment tables (verified RLS and grants).
- The webhook verifies signatures (`STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`) and is idempotent (`stripe_webhook_events`).
- Secrets live in Vercel environment variables only. Rotate them on staff change.
- Admin payment actions require aal2 (TOTP) and are audit-logged.

## 6. Identity verification and fraud controls

- Vendors: Stripe Connect onboarding (identity, bank account and ABN, handled by Stripe KYC). Payouts are blocked until `transfers_active`.
- Customers: Stripe Radar, 3-D Secure where risk-based, and velocity limits per account and card. **To build.**
- Platform: existing risk signals (contact leakage, quick cancels, disputes, shared ABN). Add payment-specific signals (chargebacks, refund rate, mismatched names) before activation. **To build.**
- Holding period before first payout for new vendors. **Decision needed.**

## 7. Audit logs and records

- `payment_events` records every state change (actor role, timestamp).
- `admin_audit_log` records admin actions.
- `stripe_webhook_events` records processed events.
- Keep transaction records for at least 5 years (tax), or the period the solicitor advises (for example 7 years).
- Reconcile Stripe balance against held milestones daily. **To build.**

## 8. Documents to update on activation

1. Terms & Conditions v2: online payments, held funds description (as permitted by the licensing outcome), approval and auto-approval, refunds, chargebacks.
2. Vendor Service Agreement v2 + Schedule 1 with the approved commission, transfer reversals, Stripe Connected Account Agreement acceptance.
3. Cancellation, Refund & Dispute Policy v2: milestone disputes, refund timelines, what Evntly can now do with held funds.
4. Privacy Policy: Stripe as a recipient (US), payment data, retention.
5. Bump versions in `src/lib/legal/versions.ts` plus a migration updating `legal_document_versions`. Everyone is re-prompted, and enforcement blocks quotes, bookings and listings until they accept.

## 9. Required approvals before activation (checklist)

- [ ] Solicitor's written advice on licensing (AFSL / exemption / structure) and on the Payments System Modernisation reforms
- [ ] Choice of charge structure (separate charges and transfers vs destination or direct charges) confirmed against that advice
- [ ] Commission rate approved and published in Schedule 1 (30 days' notice to vendors)
- [ ] Accountant's advice: GST registration, commission invoicing, Sharing Economy Reporting Regime
- [ ] Stripe live account approved for this business model (Stripe's restricted-business review)
- [ ] Updated documents (section 8) reviewed by the solicitor and published; re-acceptance live
- [ ] Refund, chargeback and dispute runbooks written; dispute SLA set
- [ ] Fraud controls (section 6) built and tested
- [ ] Reconciliation and alerting built
- [ ] Security review of the payment code paths and the webhook
- [ ] Insurance reviewed (professional indemnity, cyber)
- [ ] End-to-end test in Stripe test mode, including refunds, partial refunds, disputes and chargebacks
- [ ] Then: set Stripe env vars, run `adminSetPaymentsEnabled(true)` (also flips `payment_guard_mode` to `block`)
