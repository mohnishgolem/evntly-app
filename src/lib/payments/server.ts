import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/payments/stripe";
import { CURRENCY, DEFAULT_COMMISSION_BPS, formatAud, vendorPayoutCents } from "@/lib/payments/money";
import { notify } from "@/lib/email";
import { recordError } from "@/lib/error-report";
import type { Database } from "@/lib/supabase/database.types";

// Everything here runs with the service role and moves money, so every
// function re-derives eligibility from the database rather than trusting
// its caller. Parties never reach these directly — server actions and the
// Stripe webhook call them after their own checks.

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type Milestone = Database["public"]["Tables"]["payment_milestones"]["Row"];
export type Plan = Database["public"]["Tables"]["payment_plans"]["Row"];

function requireAdmin(): Admin {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return admin;
}

export async function logPaymentEvent(
  admin: Admin,
  planId: string,
  milestoneId: string | null,
  role: "vendor" | "customer" | "admin" | "system",
  event: string,
  detail: Record<string, unknown> = {}
) {
  await admin.from("payment_events").insert({
    plan_id: planId,
    milestone_id: milestoneId,
    actor_role: role,
    event,
    detail: detail as Database["public"]["Tables"]["payment_events"]["Insert"]["detail"],
  });
}

// ── Settings ─────────────────────────────────────────────────────────────

export type PaymentsStatus = { enabled: boolean; testMode: boolean; commissionBps: number; reason?: string };

/** Payments are live only with Stripe keys AND the admin switch on. */
export async function getPaymentsStatus(): Promise<PaymentsStatus> {
  const key = process.env.STRIPE_SECRET_KEY;
  const testMode = !key?.startsWith("sk_live_");
  const admin = createAdminClient();
  if (!admin) return { enabled: false, testMode, commissionBps: DEFAULT_COMMISSION_BPS, reason: "Server key missing" };
  const { data } = await admin.from("app_settings").select("key, value").in("key", ["payments_enabled", "commission_bps"]);
  const settings = new Map((data ?? []).map((r) => [r.key, r.value]));
  const bps = Number(settings.get("commission_bps") ?? DEFAULT_COMMISSION_BPS);
  const commissionBps = Number.isInteger(bps) && bps >= 0 && bps <= 3000 ? bps : DEFAULT_COMMISSION_BPS;
  if (!key) return { enabled: false, testMode, commissionBps, reason: "Stripe isn't connected yet" };
  if (!process.env.STRIPE_WEBHOOK_SECRET) return { enabled: false, testMode, commissionBps, reason: "Stripe webhook secret missing" };
  if (settings.get("payments_enabled") !== "true") return { enabled: false, testMode, commissionBps, reason: "Payments are switched off" };
  return { enabled: true, testMode, commissionBps };
}

// ── Vendor connected accounts ────────────────────────────────────────────

/** Mirrors a Stripe account into stripe_accounts, then releases anything that was waiting on it. */
export async function syncConnectedAccount(account: Stripe.Account) {
  const admin = requireAdmin();
  const { data: existing } = await admin
    .from("stripe_accounts")
    .select("user_id")
    .eq("account_id", account.id)
    .maybeSingle();
  // Only accounts we created (and recorded) are trusted; metadata alone isn't.
  if (!existing) return;

  const transfersActive = account.capabilities?.transfers === "active";
  await admin
    .from("stripe_accounts")
    .update({
      details_submitted: !!account.details_submitted,
      transfers_active: transfersActive,
      payouts_enabled: !!account.payouts_enabled,
      requirements_due: account.requirements?.currently_due ?? [],
      disabled_reason: account.requirements?.disabled_reason ?? null,
    })
    .eq("account_id", account.id);

  if (transfersActive) await releaseEligibleForVendor(existing.user_id);
}

/** Returns the vendor's connected account id, creating an Express account the first time. */
export async function ensureConnectedAccount(userId: string, email: string) {
  const admin = requireAdmin();
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe isn't connected yet.");

  const { data: row } = await admin.from("stripe_accounts").select("account_id").eq("user_id", userId).maybeSingle();
  if (row) return row.account_id;

  // Express account: Stripe hosts onboarding/identity checks and the payout
  // dashboard; Evntly is liable for refunds/chargebacks (it holds the funds).
  const account = await stripe.accounts.create(
    {
      country: "AU",
      email,
      controller: {
        fees: { payer: "application" },
        losses: { payments: "application" },
        stripe_dashboard: { type: "express" },
        requirement_collection: "stripe",
      },
      capabilities: { transfers: { requested: true } },
      business_profile: { product_description: "Event services booked through Evntly" },
      metadata: { evntly_user_id: userId },
    },
    { idempotencyKey: `connect-account-${userId}` }
  );
  const { error } = await admin.from("stripe_accounts").insert({ user_id: userId, account_id: account.id });
  if (error) throw new Error(error.message);
  return account.id;
}

// ── Payouts (transfers to the vendor) ────────────────────────────────────

/**
 * Pays the vendor's share of one milestone if — and only if — the database
 * says it's releasable right now (claim_milestone_payout locks the row and
 * flips it to 'processing', so two callers can never both transfer it).
 */
export async function releaseMilestone(milestoneId: string): Promise<{ released: boolean; error?: string }> {
  const admin = requireAdmin();
  const stripe = getStripe();
  if (!stripe) return { released: false, error: "Stripe isn't connected yet." };

  const { data: claimed } = await admin.rpc("claim_milestone_payout", { p_milestone_id: milestoneId });
  const m = claimed?.[0];
  if (!m) return { released: false };

  const { data: plan } = await admin.from("payment_plans").select("*").eq("id", m.plan_id).single();
  const { data: account } = await admin
    .from("stripe_accounts")
    .select("account_id")
    .eq("user_id", plan!.vendor_user_id)
    .single();
  const payout = vendorPayoutCents(m.amount_cents, plan!.commission_bps);

  let transfer: Stripe.Transfer;
  try {
    transfer = await stripe.transfers.create(
      {
        amount: payout,
        currency: CURRENCY,
        destination: account!.account_id,
        source_transaction: m.charge_id!,
        transfer_group: plan!.transfer_group,
        description: `Evntly payout: ${m.name}`,
        metadata: { milestone_id: m.id, plan_id: plan!.id },
      },
      // One key per claim: a retried request can't create a second transfer.
      { idempotencyKey: `payout-${m.id}-${m.updated_at}` }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin.from("payment_milestones").update({ payout_status: "failed", last_error: message.slice(0, 500) }).eq("id", m.id);
    await logPaymentEvent(admin, plan!.id, m.id, "system", "payout_failed", { error: message.slice(0, 500) });
    await recordError({ source: "server", message: `Payout failed for milestone ${m.id}: ${message}` });
    return { released: false, error: "The payout couldn't be sent. Evntly support has been notified." };
  }

  // The money has moved. From here on nothing may mark the payout failed:
  // bookkeeping problems are logged, and the transfer.created webhook
  // reconciles the row if this write didn't land.
  await admin
    .from("payment_milestones")
    .update({ payout_status: "paid", transfer_id: transfer.id, payout_cents: payout, paid_out_at: new Date().toISOString() })
    .eq("id", m.id);
  try {
    await logPaymentEvent(admin, plan!.id, m.id, "system", "payout_sent", { payout_cents: payout, transfer_id: transfer.id });
    await completePlanIfDone(admin, plan!.id);
    await notifyParty(admin, plan!, "vendor", {
      subject: `${formatAud(payout)} released for "${m.name}"`,
      heading: "Payment released",
      lines: [
        `${formatAud(payout)} for "${m.name}" is on its way to your Stripe account (the milestone amount less Evntly's commission).`,
        "Stripe pays it out to your bank on your usual payout schedule.",
      ],
    });
  } catch (err) {
    await recordError({ source: "server", message: `Post-payout bookkeeping failed for ${m.id}: ${String(err)}` });
  }
  return { released: true };
}

/** Retries every releasable milestone for a vendor (e.g. after they finish onboarding). */
export async function releaseEligibleForVendor(vendorUserId: string) {
  const admin = requireAdmin();
  const { data: plans } = await admin
    .from("payment_plans")
    .select("id")
    .eq("vendor_user_id", vendorUserId)
    .in("status", ["agreed", "active"]);
  if (!plans?.length) return;
  const { data: milestones } = await admin
    .from("payment_milestones")
    .select("id")
    .in("plan_id", plans.map((p) => p.id))
    .eq("funding_status", "funded")
    .in("payout_status", ["not_started"]);
  for (const m of milestones ?? []) await releaseMilestone(m.id);
}

/** Releases the deposit on a booking (called when the vendor confirms it). */
export async function releaseDepositForBooking(bookingId: string) {
  const admin = createAdminClient();
  if (!admin || !getStripe()) return;
  const { data: plan } = await admin.from("payment_plans").select("id").eq("booking_id", bookingId).maybeSingle();
  if (!plan) return;
  const { data: deposit } = await admin
    .from("payment_milestones")
    .select("id")
    .eq("plan_id", plan.id)
    .eq("kind", "deposit")
    .maybeSingle();
  if (deposit) await releaseMilestone(deposit.id);
}

async function completePlanIfDone(admin: Admin, planId: string) {
  const { data: open } = await admin
    .from("payment_milestones")
    .select("id")
    .eq("plan_id", planId)
    .neq("payout_status", "paid")
    .neq("work_status", "cancelled")
    .limit(1);
  if (!open?.length) {
    await admin.from("payment_plans").update({ status: "completed" }).eq("id", planId);
    await logPaymentEvent(admin, planId, null, "system", "plan_completed");
  }
}

// ── Customer payments (Checkout) ─────────────────────────────────────────

/**
 * Creates (or reuses) a Stripe Checkout page for one milestone. The caller
 * must already have checked the user is signed in; this checks they're the
 * customer on the plan and that the milestone can be paid now.
 */
export async function createMilestoneCheckout(
  milestoneId: string,
  userId: string,
  origin: string
): Promise<{ url?: string; error?: string }> {
  const status = await getPaymentsStatus();
  if (!status.enabled) return { error: "Online payments aren't switched on yet." };
  const admin = requireAdmin();
  const stripe = getStripe()!;

  const { data: m } = await admin.from("payment_milestones").select("*").eq("id", milestoneId).maybeSingle();
  if (!m) return { error: "Payment not found." };
  const { data: plan } = await admin.from("payment_plans").select("*").eq("id", m.plan_id).single();
  if (!plan || plan.customer_user_id !== userId) return { error: "Payment not found." };
  if (!["agreed", "active"].includes(plan.status)) return { error: "Agree to the payment plan first." };
  if (!["unfunded", "failed"].includes(m.funding_status)) return { error: "This payment is already paid or in progress." };
  if (["cancelled", "disputed"].includes(m.work_status)) return { error: "This payment is on hold." };

  // Deposit first: later milestones can't be paid until it is.
  if (m.kind !== "deposit") {
    const { data: deposit } = await admin
      .from("payment_milestones")
      .select("funding_status")
      .eq("plan_id", plan.id)
      .eq("kind", "deposit")
      .maybeSingle();
    if (deposit && deposit.funding_status !== "funded") return { error: "Pay the booking deposit first." };
  }

  // The vendor must be able to receive the money before we take it.
  const { data: account } = await admin
    .from("stripe_accounts")
    .select("transfers_active")
    .eq("user_id", plan.vendor_user_id)
    .maybeSingle();
  if (!account?.transfers_active) {
    return { error: "The vendor is still setting up payouts. We've let them know — try again soon." };
  }

  // Reuse an open session so double-clicks don't create two payments.
  if (m.checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(m.checkout_session_id).catch(() => null);
    if (existing?.status === "open" && existing.url) return { url: existing.url };
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("id, provider_name, event_date")
    .eq("id", plan.booking_id)
    .single();
  const { data: customer } = await admin.auth.admin.getUserById(userId);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // Methods come from the Stripe dashboard; exclude bank debits and
    // pay-later options, which can fail days after we've paid the vendor.
    excluded_payment_method_types: ["au_becs_debit", "payto", "pay_by_bank", "afterpay_clearpay", "zip", "klarna"],
    customer_email: customer.user?.email ?? undefined,
    client_reference_id: m.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: m.amount_cents,
          product_data: {
            name: `${booking?.provider_name ?? "Vendor"} — ${m.name}`,
            description:
              m.kind === "deposit"
                ? "Booking deposit. Held by Evntly and released to the vendor when they confirm your booking."
                : "Held by Evntly and released to the vendor when you approve this milestone.",
          },
        },
      },
    ],
    payment_intent_data: {
      transfer_group: plan.transfer_group,
      description: `Evntly booking ${plan.booking_id}: ${m.name}`,
      metadata: { milestone_id: m.id, plan_id: plan.id, booking_id: plan.booking_id },
    },
    metadata: { milestone_id: m.id, plan_id: plan.id },
    success_url: `${origin}/bookings/${plan.booking_id}?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/bookings/${plan.booking_id}`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  await admin.from("payment_milestones").update({ checkout_session_id: session.id }).eq("id", m.id);
  await logPaymentEvent(admin, plan.id, m.id, "customer", "checkout_started");
  return { url: session.url ?? undefined };
}

// ── Webhook handlers ─────────────────────────────────────────────────────

/** A Checkout session was paid: verify it against our record, mark funded, try to release. */
export async function handleCheckoutPaid(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;
  const admin = requireAdmin();
  const stripe = getStripe()!;
  const milestoneId = session.metadata?.milestone_id;
  if (!milestoneId) return;

  const { data: m } = await admin.from("payment_milestones").select("*").eq("id", milestoneId).maybeSingle();
  if (!m || m.funding_status === "funded") return;
  // Only the session we created for this milestone, for exactly its amount.
  if (m.checkout_session_id !== session.id) throw new Error(`Session ${session.id} doesn't match milestone ${m.id}`);
  if (session.amount_total !== m.amount_cents || session.currency !== CURRENCY) {
    throw new Error(`Amount mismatch on ${session.id}: ${session.amount_total} ${session.currency}`);
  }

  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const pi = piId ? await stripe.paymentIntents.retrieve(piId) : null;
  const chargeId = typeof pi?.latest_charge === "string" ? pi.latest_charge : pi?.latest_charge?.id;
  if (!pi || pi.status !== "succeeded" || !chargeId) throw new Error(`Payment ${piId} hasn't succeeded`);

  await admin
    .from("payment_milestones")
    .update({ funding_status: "funded", payment_intent_id: pi.id, charge_id: chargeId, funded_at: new Date().toISOString() })
    .eq("id", m.id);
  const { data: plan } = await admin.from("payment_plans").select("*").eq("id", m.plan_id).single();
  if (plan!.status === "agreed") await admin.from("payment_plans").update({ status: "active" }).eq("id", plan!.id);
  await logPaymentEvent(admin, plan!.id, m.id, "system", "payment_received", { amount_cents: m.amount_cents });

  await notifyParty(admin, plan!, "vendor", {
    subject: `Payment received: ${m.name}`,
    heading: "The customer has paid",
    lines: [
      `${formatAud(m.amount_cents)} for "${m.name}" is now held by Evntly.`,
      m.kind === "deposit"
        ? "It's released to you when you confirm the booking."
        : "It's released to you when the customer approves this milestone.",
    ],
  });
  await releaseMilestone(m.id);
}

/** Checkout expired or an async payment failed: reopen the milestone for payment. */
export async function handleCheckoutFailed(session: Stripe.Checkout.Session, failed: boolean) {
  const admin = requireAdmin();
  const { data: m } = await admin
    .from("payment_milestones")
    .select("id, plan_id, funding_status")
    .eq("checkout_session_id", session.id)
    .maybeSingle();
  if (!m || m.funding_status === "funded") return;
  await admin
    .from("payment_milestones")
    .update({ funding_status: failed ? "failed" : "unfunded", checkout_session_id: null })
    .eq("id", m.id);
  if (failed) await logPaymentEvent(admin, m.plan_id, m.id, "system", "payment_failed");
}

/** A charge was refunded (by an admin action or in the Stripe dashboard). */
export async function handleChargeRefunded(charge: Stripe.Charge) {
  const admin = requireAdmin();
  const { data: m } = await admin.from("payment_milestones").select("id, plan_id").eq("charge_id", charge.id).maybeSingle();
  if (!m) return;
  const full = charge.amount_refunded >= charge.amount;
  await admin
    .from("payment_milestones")
    .update({ funding_status: full ? "refunded" : "partially_refunded" })
    .eq("id", m.id);
  await logPaymentEvent(admin, m.plan_id, m.id, "system", full ? "refunded" : "partially_refunded", {
    amount_refunded: charge.amount_refunded,
  });
}

/** A card dispute (chargeback): freeze the milestone and alert admins. */
export async function handleChargeDispute(dispute: Stripe.Dispute) {
  const admin = requireAdmin();
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const { data: m } = await admin.from("payment_milestones").select("id, plan_id, name").eq("charge_id", chargeId).maybeSingle();
  if (!m) return;
  await admin.from("payment_milestones").update({ work_status: "disputed" }).eq("id", m.id);
  await logPaymentEvent(admin, m.plan_id, m.id, "system", "chargeback_opened", { reason: dispute.reason, dispute_id: dispute.id });
  await recordError({ source: "server", message: `Chargeback opened on milestone ${m.id} (${dispute.reason})` });
}

/** Reconciles a transfer we created (covers a crash between Stripe and our DB write). */
export async function handleTransfer(transfer: Stripe.Transfer) {
  const milestoneId = transfer.metadata?.milestone_id;
  if (!milestoneId) return;
  const admin = requireAdmin();
  const { data: m } = await admin
    .from("payment_milestones")
    .select("id, plan_id, payout_status, transfer_id")
    .eq("id", milestoneId)
    .maybeSingle();
  if (!m) return;
  if (transfer.reversed) {
    await admin.from("payment_milestones").update({ payout_status: "reversed" }).eq("id", m.id);
    await logPaymentEvent(admin, m.plan_id, m.id, "system", "payout_reversed", { transfer_id: transfer.id });
  } else if (m.payout_status === "processing" && !m.transfer_id) {
    await admin
      .from("payment_milestones")
      .update({ payout_status: "paid", transfer_id: transfer.id, payout_cents: transfer.amount, paid_out_at: new Date().toISOString() })
      .eq("id", m.id);
    await logPaymentEvent(admin, m.plan_id, m.id, "system", "payout_reconciled", { transfer_id: transfer.id });
  }
}

/** Routes a verified Stripe event to its handler. Unknown types are ignored. */
export async function dispatchStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return handleCheckoutPaid(event.data.object);
    case "checkout.session.expired":
      return handleCheckoutFailed(event.data.object, false);
    case "checkout.session.async_payment_failed":
      return handleCheckoutFailed(event.data.object, true);
    case "charge.refunded":
      return handleChargeRefunded(event.data.object);
    case "charge.dispute.created":
      return handleChargeDispute(event.data.object);
    case "transfer.created":
    case "transfer.reversed":
      return handleTransfer(event.data.object);
    case "account.updated":
      return syncConnectedAccount(event.data.object);
    default:
      return;
  }
}

// ── Admin money movements ────────────────────────────────────────────────

/** Refunds a milestone to the customer, pulling the vendor's share back first if it was paid. */
export async function refundMilestone(milestoneId: string, reason: string): Promise<{ error?: string }> {
  const admin = requireAdmin();
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe isn't connected." };
  const { data: m } = await admin.from("payment_milestones").select("*").eq("id", milestoneId).maybeSingle();
  if (!m?.payment_intent_id || m.funding_status !== "funded") return { error: "Only funded payments can be refunded." };
  if (m.payout_status === "processing") return { error: "A payout is in progress — try again in a minute." };

  try {
    if (m.payout_status === "paid" && m.transfer_id) {
      await stripe.transfers.createReversal(m.transfer_id, {}, { idempotencyKey: `reverse-${m.id}` });
      await admin.from("payment_milestones").update({ payout_status: "reversed" }).eq("id", m.id);
    }
    const refund = await stripe.refunds.create(
      { payment_intent: m.payment_intent_id, reason: "requested_by_customer", metadata: { milestone_id: m.id } },
      { idempotencyKey: `refund-${m.id}` }
    );
    await admin
      .from("payment_milestones")
      .update({ funding_status: "refunded", refund_id: refund.id, work_status: "cancelled" })
      .eq("id", m.id);
    await logPaymentEvent(admin, m.plan_id, m.id, "admin", "refunded", { reason: reason.slice(0, 500), refund_id: refund.id });
    const { data: plan } = await admin.from("payment_plans").select("*").eq("id", m.plan_id).single();
    await notifyParty(admin, plan!, "customer", {
      subject: `Refund issued: ${m.name}`,
      heading: "Your payment has been refunded",
      lines: [`${formatAud(m.amount_cents)} for "${m.name}" has been refunded to your card. It usually arrives in 5–10 business days.`],
    });
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logPaymentEvent(admin, m.plan_id, m.id, "admin", "refund_failed", { error: message.slice(0, 500) });
    return { error: message };
  }
}

// ── Notifications ───────────────────────────────────────────────────────

export async function notifyParty(
  admin: Admin,
  plan: Plan,
  who: "vendor" | "customer",
  message: { subject: string; heading: string; lines: string[] }
) {
  const userId = who === "vendor" ? plan.vendor_user_id : plan.customer_user_id;
  const { data } = await admin.auth.admin.getUserById(userId);
  notify({ category: "bookings", to: data.user?.email, ...message, cta: { label: "View booking", path: `/bookings/${plan.booking_id}` } });
}
