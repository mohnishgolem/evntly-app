"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/data/user";
import { notify } from "@/lib/email";
import { isDisputeOutcome, isDisputeReason, outcomeLabel, reasonLabel } from "@/lib/disputes";

export type DisputeActionState = { error?: string; success?: boolean } | null;

// All writes go through security-definer RPCs: they work out who the caller
// is (customer, vendor or admin) from the session, so roles and statuses
// can't be forged from the browser. These actions validate input, give
// clean errors, and send the notifications.

const openSchema = z.object({
  bookingId: z.string().min(1).max(100),
  reason: z.string().refine(isDisputeReason, "Pick what the problem is."),
  description: z.string().trim().min(20, "Please describe what happened (at least 20 characters).").max(4000),
  desiredOutcome: z.string().trim().max(1000),
});

function clean(message: string) {
  // RPC errors are written for people; anything else gets a generic line.
  return /^[A-Z][^\n]{3,200}$/.test(message) && !/violates|permission|relation|function/i.test(message)
    ? message
    : "Something went wrong. Please try again.";
}

/** Parties' current addresses and the booking they're about, via the service role. */
async function disputeContext(disputeId: string) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: d } = await admin
    .from("booking_disputes")
    .select("id, booking_id, reason, status, outcome, resolution_note, opened_by_role, customer_user_id, vendor_user_id")
    .eq("id", disputeId)
    .maybeSingle();
  if (!d) return null;
  const email = async (id: string | null) => (id ? (await admin.auth.admin.getUserById(id)).data.user?.email ?? null : null);
  const [customer, vendor, { data: admins }] = await Promise.all([
    email(d.customer_user_id),
    email(d.vendor_user_id),
    admin.from("users").select("email").eq("role", "admin"),
  ]);
  return { d, customer, vendor, admins: (admins ?? []).map((a) => a.email).filter((e): e is string => !!e) };
}

export async function openDispute(input: z.input<typeof openSchema>): Promise<DisputeActionState & { disputeId?: string }> {
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("open_booking_dispute", {
    p_booking_id: d.bookingId,
    p_reason: d.reason,
    p_description: d.description,
    p_desired_outcome: d.desiredOutcome || undefined,
  });
  if (error || !id) return { error: clean(error?.message ?? "") };

  const ctx = await disputeContext(id);
  if (ctx) {
    const counterparty = ctx.d.opened_by_role === "customer" ? ctx.vendor : ctx.customer;
    const path = `/bookings/${ctx.d.booking_id}`;
    notify({
      category: "bookings",
      to: counterparty,
      subject: `A problem was raised on your booking: ${reasonLabel(d.reason)}`,
      heading: "A problem was raised on your booking",
      lines: [
        `The ${ctx.d.opened_by_role} has raised a ${reasonLabel(d.reason).toLowerCase()} issue. Evntly will review it.`,
        "You can reply with your side of the story on the booking page.",
      ],
      quote: d.description,
      cta: { label: "View and reply", path },
    });
    for (const to of ctx.admins) {
      notify({
        category: "bookings",
        to,
        subject: `New dispute: ${reasonLabel(d.reason)}`,
        heading: "New dispute to review",
        lines: [`A ${ctx.d.opened_by_role} raised a ${reasonLabel(d.reason).toLowerCase()} dispute.`],
        quote: d.description,
        cta: { label: "Open the dispute", path: `/admin/disputes/${id}` },
      });
    }
  }
  revalidatePath(`/bookings/${d.bookingId}`);
  return { success: true, disputeId: id };
}

const messageSchema = z.object({ disputeId: z.uuid(), body: z.string().trim().min(1, "Write a message first.").max(4000) });

export async function postDisputeMessage(disputeId: string, body: string): Promise<DisputeActionState> {
  const parsed = messageSchema.safeParse({ disputeId, body });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your message." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_dispute_message", { p_dispute_id: parsed.data.disputeId, p_body: parsed.data.body });
  if (error) return { error: clean(error.message) };

  const ctx = await disputeContext(parsed.data.disputeId);
  if (ctx) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const fromAdmin = user?.id !== ctx.d.customer_user_id && user?.id !== ctx.d.vendor_user_id;
    const recipients = fromAdmin
      ? [ctx.customer, ctx.vendor]
      : [user?.id === ctx.d.customer_user_id ? ctx.vendor : ctx.customer];
    for (const to of recipients) {
      notify({
        category: "bookings",
        to,
        subject: fromAdmin ? "Evntly replied about your booking dispute" : "New reply on your booking dispute",
        heading: fromAdmin ? "Evntly replied about the dispute" : "New reply on the dispute",
        lines: [],
        quote: parsed.data.body,
        cta: { label: "View the dispute", path: `/bookings/${ctx.d.booking_id}` },
      });
    }
    revalidatePath(`/bookings/${ctx.d.booking_id}`);
  }
  revalidatePath(`/admin/disputes/${parsed.data.disputeId}`);
  return { success: true };
}

export async function withdrawDispute(disputeId: string): Promise<DisputeActionState> {
  if (!z.uuid().safeParse(disputeId).success) return { error: "Dispute not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_booking_dispute", { p_dispute_id: disputeId });
  if (error) return { error: clean(error.message) };
  const ctx = await disputeContext(disputeId);
  if (ctx) revalidatePath(`/bookings/${ctx.d.booking_id}`);
  return { success: true };
}

const adminSchema = z
  .object({
    disputeId: z.uuid(),
    status: z.enum(["open", "under_review", "resolved"]),
    outcome: z.string().nullable(),
    note: z.string().trim().max(4000),
  })
  .refine((s) => s.status !== "resolved" || (isDisputeOutcome(s.outcome) && s.note.length >= 10), "Pick an outcome and write a note (10+ characters) for both parties.");

export async function adminUpdateDispute(input: z.input<typeof adminSchema>): Promise<DisputeActionState> {
  const { admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return { error: "Not authorized." };
  const parsed = adminSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const s = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_dispute", {
    p_dispute_id: s.disputeId,
    p_status: s.status,
    // Ignored by the RPC unless resolving.
    p_outcome: s.status === "resolved" ? (s.outcome as string) : "",
    p_note: s.status === "resolved" ? s.note : "",
  });
  if (error) return { error: clean(error.message) };

  const ctx = await disputeContext(s.disputeId);
  if (ctx && (s.status === "resolved" || s.status === "under_review")) {
    for (const to of [ctx.customer, ctx.vendor]) {
      notify({
        category: "bookings",
        to,
        subject: s.status === "resolved" ? "Your booking dispute has been resolved" : "Evntly is reviewing your booking dispute",
        heading: s.status === "resolved" ? outcomeLabel(s.outcome) : "We're reviewing the dispute",
        lines:
          s.status === "resolved"
            ? ["Evntly has finished reviewing the dispute on your booking."]
            : ["We've started looking into the problem raised on your booking and may ask either of you for more detail."],
        quote: s.status === "resolved" ? s.note : null,
        cta: { label: "View the booking", path: `/bookings/${ctx.d.booking_id}` },
      });
    }
    revalidatePath(`/bookings/${ctx.d.booking_id}`);
  }
  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${s.disputeId}`);
  return { success: true };
}

const reviewSchema = z.object({ userId: z.string().min(1).max(100), note: z.string().trim().min(1, "Add a note about what you found.").max(2000) });

export async function markRiskReviewed(userId: string, note: string): Promise<DisputeActionState> {
  const { admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return { error: "Not authorized." };
  const parsed = reviewSchema.safeParse({ userId, note });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the note." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_mark_risk_reviewed", { p_user_id: parsed.data.userId, p_note: parsed.data.note });
  if (error) return { error: clean(error.message) };
  revalidatePath("/admin/risk");
  return { success: true };
}
