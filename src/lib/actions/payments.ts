"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/data/user";
import { checkRateLimit, RATE_LIMIT_ERROR } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/config";
import { getStripe } from "@/lib/payments/stripe";
import {
  createMilestoneCheckout,
  ensureConnectedAccount,
  getPaymentsStatus,
  logPaymentEvent,
  notifyParty,
  refundMilestone,
  releaseMilestone,
  syncConnectedAccount,
} from "@/lib/payments/server";
import { formatAud } from "@/lib/payments/money";

export type PaymentActionState = { error?: string; success?: boolean; url?: string; clientSecret?: string } | null;

// Redirect targets for Stripe-hosted pages. Only our own origins: production,
// this project's Vercel previews, and local dev.
async function trustedOrigin() {
  const h = await headers();
  const origin = h.get("origin") ?? "";
  if (
    origin === SITE_URL ||
    /^https:\/\/evntly-[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin)
  ) {
    return origin;
  }
  return SITE_URL;
}

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function friendly(error: { message: string } | null | undefined) {
  // RPC exceptions are written for users; anything else is generic.
  const msg = error?.message ?? "";
  return msg && !/permission denied|violates|syntax|function/i.test(msg) ? msg : "Something went wrong. Please try again.";
}

function revalidateBooking(bookingId: string) {
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/vendor-dashboard", "layout");
  revalidatePath("/dashboard/bookings");
}

async function planContext(planId: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: plan } = await admin.from("payment_plans").select("*").eq("id", planId).maybeSingle();
  return plan && { admin, plan };
}

async function milestoneContext(milestoneId: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: m } = await admin.from("payment_milestones").select("*").eq("id", milestoneId).maybeSingle();
  if (!m) return null;
  const { data: plan } = await admin.from("payment_plans").select("*").eq("id", m.plan_id).single();
  return plan && { admin, plan, m };
}

// ── Vendor: propose a plan ───────────────────────────────────────────────

const itemSchema = z.object({
  kind: z.enum(["deposit", "milestone", "full"]),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  deliverables: z.string().trim().max(2000).optional(),
  amountCents: z.number().int().positive().max(10_000_000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});
const planSchema = z.object({
  bookingId: z.string().min(1).max(64),
  planType: z.enum(["deposit_milestones", "full", "milestones"]),
  items: z.array(itemSchema).min(1).max(12),
});

export async function proposePaymentPlan(input: z.infer<typeof planSchema>): Promise<PaymentActionState> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { error: "Check each payment has a name and an amount." };
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please log in again." };
  if (!(await checkRateLimit("paymentUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { bookingId, planType, items } = parsed.data;
  const { data: planId, error } = await supabase.rpc("propose_payment_plan", {
    p_booking_id: bookingId,
    p_plan_type: planType,
    p_milestones: items.map((i) => ({
      kind: i.kind,
      name: i.name,
      description: i.description ?? "",
      deliverables: i.deliverables ?? "",
      amount_cents: i.amountCents,
      due_date: i.dueDate ?? "",
    })),
  });
  if (error) return { error: friendly(error) };

  const ctx = await planContext(planId);
  if (ctx) {
    await notifyParty(ctx.admin, ctx.plan, "customer", {
      subject: "Your vendor proposed a payment plan",
      heading: "Review your payment plan",
      lines: [
        `Your vendor has proposed how the ${formatAud(ctx.plan.total_cents)} booking will be paid.`,
        "Check the milestones and amounts, then agree or ask for changes.",
      ],
    });
  }
  revalidateBooking(bookingId);
  return { success: true };
}

// ── Customer: agree or request changes ───────────────────────────────────

export async function respondToPaymentPlan(planId: string, agree: boolean, note?: string): Promise<PaymentActionState> {
  if (!z.string().uuid().safeParse(planId).success) return { error: "Plan not found." };
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please log in again." };
  if (!(await checkRateLimit("paymentUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { error } = await supabase.rpc("respond_to_payment_plan", {
    p_plan_id: planId,
    p_agree: agree,
    p_note: note?.slice(0, 2000),
  });
  if (error) return { error: friendly(error) };

  const ctx = await planContext(planId);
  if (ctx) {
    await notifyParty(ctx.admin, ctx.plan, "vendor", agree
      ? { subject: "Payment plan agreed", heading: "The customer agreed to your payment plan", lines: ["They can now pay the first payment. You'll get an email when it's received."] }
      : { subject: "Changes requested to your payment plan", heading: "The customer asked for changes", lines: [note?.trim() || "Open the booking to see their note and send an updated plan."] });
    revalidateBooking(ctx.plan.booking_id);
  }
  return { success: true };
}

// ── Vendor: progress / submit work ───────────────────────────────────────

export async function updateMilestoneWork(
  milestoneId: string,
  status: "in_progress" | "submitted",
  note?: string,
  evidencePaths?: string[]
): Promise<PaymentActionState> {
  if (!z.string().uuid().safeParse(milestoneId).success) return { error: "Milestone not found." };
  if (evidencePaths && (evidencePaths.length > 10 || evidencePaths.some((p) => p.length > 300))) {
    return { error: "Too many files." };
  }
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please log in again." };
  if (!(await checkRateLimit("paymentUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { error } = await supabase.rpc("update_milestone_work", {
    p_milestone_id: milestoneId,
    p_status: status,
    p_note: note?.slice(0, 2000),
    p_evidence: evidencePaths?.length ? evidencePaths : undefined,
  });
  if (error) return { error: friendly(error) };

  const ctx = await milestoneContext(milestoneId);
  if (ctx) {
    if (status === "submitted") {
      await notifyParty(ctx.admin, ctx.plan, "customer", {
        subject: `Ready for review: ${ctx.m.name}`,
        heading: "Your vendor marked a milestone complete",
        lines: [`Review "${ctx.m.name}" and approve it to release ${formatAud(ctx.m.amount_cents)} to the vendor, or tell them what still needs doing.`],
      });
    }
    revalidateBooking(ctx.plan.booking_id);
  }
  return { success: true };
}

// ── Customer: approve / reject ───────────────────────────────────────────

export async function reviewMilestone(milestoneId: string, approve: boolean, note?: string): Promise<PaymentActionState> {
  if (!z.string().uuid().safeParse(milestoneId).success) return { error: "Milestone not found." };
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please log in again." };
  if (!(await checkRateLimit("paymentUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { error } = await supabase.rpc("review_milestone", {
    p_milestone_id: milestoneId,
    p_approve: approve,
    p_note: note?.slice(0, 2000),
  });
  if (error) return { error: friendly(error) };

  const ctx = await milestoneContext(milestoneId);
  if (ctx) {
    if (approve) {
      // Approval alone moves nothing: release re-checks funding, disputes
      // and the vendor's Stripe account in the database before transferring.
      await releaseMilestone(milestoneId);
    } else {
      await notifyParty(ctx.admin, ctx.plan, "vendor", {
        subject: `Changes requested: ${ctx.m.name}`,
        heading: "The customer asked for changes",
        lines: [note?.trim() || "Open the booking to see what they need."],
      });
    }
    revalidateBooking(ctx.plan.booking_id);
  }
  return { success: true };
}

// ── Either party: dispute ────────────────────────────────────────────────

export async function disputeMilestone(milestoneId: string, note: string): Promise<PaymentActionState> {
  if (!z.string().uuid().safeParse(milestoneId).success) return { error: "Milestone not found." };
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please log in again." };
  if (!(await checkRateLimit("paymentUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { error } = await supabase.rpc("dispute_milestone", { p_milestone_id: milestoneId, p_note: note.slice(0, 2000) });
  if (error) return { error: friendly(error) };

  const ctx = await milestoneContext(milestoneId);
  if (ctx) {
    const other = ctx.plan.vendor_user_id === user.id ? "customer" : "vendor";
    await notifyParty(ctx.admin, ctx.plan, other, {
      subject: `Dispute raised: ${ctx.m.name}`,
      heading: "A dispute was raised on your booking",
      lines: ["The payment for this milestone is on hold while Evntly support reviews it. We'll be in touch."],
    });
    revalidateBooking(ctx.plan.booking_id);
  }
  return { success: true };
}

// ── Customer: pay a milestone (Stripe Checkout) ──────────────────────────

export async function payMilestone(milestoneId: string): Promise<PaymentActionState> {
  if (!z.string().uuid().safeParse(milestoneId).success) return { error: "Payment not found." };
  const { user } = await signedIn();
  if (!user) return { error: "Please log in again." };
  if (!(await checkRateLimit("paymentUser", user.id))) return { error: RATE_LIMIT_ERROR };
  try {
    return await createMilestoneCheckout(milestoneId, user.id);
  } catch (err) {
    console.error("checkout failed", err);
    return { error: "We couldn't open the payment form. Please try again." };
  }
}

// ── Vendor: Stripe onboarding & dashboard ────────────────────────────────

export async function startPayoutSetup(): Promise<PaymentActionState> {
  const { supabase, user } = await signedIn();
  if (!user?.email) return { error: "Please log in again." };
  if (!(await checkRateLimit("paymentUser", user.id))) return { error: RATE_LIMIT_ERROR };
  const { data: listing } = await supabase.rpc("my_service_providers").select("id").limit(1).maybeSingle();
  if (!listing) return { error: "Create your vendor listing first." };
  const stripe = getStripe();
  if (!stripe) return { error: "Online payments aren't available yet." };

  try {
    const accountId = await ensureConnectedAccount(user.id, user.email);
    const origin = await trustedOrigin();
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/vendor-dashboard/payouts?refresh=1`,
      return_url: `${origin}/vendor-dashboard/payouts?return=1`,
    });
    return { url: link.url };
  } catch (err) {
    console.error("payout setup failed", err);
    return { error: "We couldn't start payout setup. Please try again." };
  }
}

export async function openPayoutDashboard(): Promise<PaymentActionState> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Please log in again." };
  const { data: row } = await supabase.from("stripe_accounts").select("account_id").eq("user_id", user.id).maybeSingle();
  const stripe = getStripe();
  if (!row || !stripe) return { error: "Set up payouts first." };
  const link = await stripe.accounts.createLoginLink(row.account_id);
  return { url: link.url };
}

/** Re-reads the vendor's account from Stripe (on return from onboarding). */
export async function refreshPayoutStatus(): Promise<void> {
  const { supabase, user } = await signedIn();
  if (!user) return;
  const { data: row } = await supabase.from("stripe_accounts").select("account_id").eq("user_id", user.id).maybeSingle();
  const stripe = getStripe();
  if (!row || !stripe) return;
  await syncConnectedAccount(await stripe.accounts.retrieve(row.account_id));
  revalidatePath("/vendor-dashboard/payouts");
}

// ── Admin ────────────────────────────────────────────────────────────────

async function requirePaymentsAdmin() {
  const { session, admin, mfa } = await getAdminSession();
  return session && admin && mfa === "ok" ? session : null;
}

export async function adminRetryPayout(milestoneId: string): Promise<PaymentActionState> {
  if (!(await requirePaymentsAdmin())) return { error: "Not authorized." };
  const res = await releaseMilestone(milestoneId);
  revalidatePath("/admin/payments");
  return res.released ? { success: true } : { error: res.error ?? "Not releasable right now (check funding, approval and the vendor's Stripe account)." };
}

export async function adminRefundMilestone(milestoneId: string, reason: string): Promise<PaymentActionState> {
  if (!(await requirePaymentsAdmin())) return { error: "Not authorized." };
  if (reason.trim().length < 5) return { error: "Add a reason for the audit log." };
  const res = await refundMilestone(milestoneId, reason);
  revalidatePath("/admin/payments");
  return res.error ? { error: res.error } : { success: true };
}

/** Ends an in-app dispute in the vendor's favour: approve and release. */
export async function adminReleaseDisputed(milestoneId: string, reason: string): Promise<PaymentActionState> {
  const session = await requirePaymentsAdmin();
  if (!session) return { error: "Not authorized." };
  if (reason.trim().length < 5) return { error: "Add a reason for the audit log." };
  const ctx = await milestoneContext(milestoneId);
  if (!ctx || ctx.m.work_status !== "disputed") return { error: "This milestone isn't disputed." };
  await ctx.admin
    .from("payment_milestones")
    .update({ work_status: "approved", approved_at: new Date().toISOString() })
    .eq("id", milestoneId);
  await logPaymentEvent(ctx.admin, ctx.plan.id, milestoneId, "admin", "dispute_resolved_release", {
    reason: reason.slice(0, 500),
    admin_user_id: session.user.id,
  });
  const res = await releaseMilestone(milestoneId);
  revalidatePath("/admin/payments");
  return res.released ? { success: true } : { error: res.error ?? "Approved, but not releasable yet (unfunded or vendor not set up)." };
}

/** Turns online payments on/off. On also switches the payment-talk filter to blocking. */
export async function adminSetPaymentsEnabled(enabled: boolean): Promise<PaymentActionState> {
  if (!(await requirePaymentsAdmin())) return { error: "Not authorized." };
  const admin = createAdminClient();
  if (!admin) return { error: "Server key missing." };
  if (enabled) {
    const status = await getPaymentsStatus();
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return { error: status.reason ?? "Stripe keys are missing." };
    }
  }
  await admin.from("app_settings").upsert([
    { key: "payments_enabled", value: enabled ? "true" : "false" },
    { key: "payment_guard_mode", value: enabled ? "block" : "log" },
  ]);
  revalidatePath("/admin/payments");
  return { success: true };
}
