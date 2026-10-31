"use server";

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/data/user";
import { notify } from "@/lib/email";
import { parseWaitlistCsv } from "@/lib/founding/csv";
import { newInviteToken } from "@/lib/founding/tokens";
import { inviteHeaders, renderInviteEmail } from "@/lib/founding/invite-email";
import { CLAIM_PATH } from "@/lib/founding/sources";
import { inviteSendingStatus } from "@/lib/founding/sending";

export type AdminFoundingState = { error?: string; success?: boolean; message?: string; details?: string[] } | null;

const PATH = "/admin/beta-vendors";

// Same gate as lib/actions/admin.ts: admin role + MFA-verified session. The
// RPCs check is_admin() again in the database.
async function requireAdmin() {
  const { session, admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return null;
  return session;
}

const MAX_CSV_BYTES = 1_000_000;
const MAX_ROWS = 2000;

/** Upserts waitlist contacts. Never re-subscribes anyone and never turns consent off. */
export async function importWaitlist(_prev: AdminFoundingState, formData: FormData): Promise<AdminFoundingState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const file = formData.get("file");
  const pasted = formData.get("csv")?.toString() ?? "";
  const text = file instanceof File && file.size > 0 ? await file.text() : pasted;
  if (!text.trim()) return { error: "Choose a CSV file or paste the rows." };
  if (text.length > MAX_CSV_BYTES) return { error: "That file is too large (1 MB max)." };

  const { rows, errors } = parseWaitlistCsv(text);
  if (rows.length > MAX_ROWS) return { error: `Up to ${MAX_ROWS} rows per import.` };
  if (rows.length === 0) return { error: errors[0] ?? "No rows to import.", details: errors.slice(1, 20) };

  const admin = createAdminClient();
  if (!admin) return { error: "The service key isn't configured." };

  const { data: existing } = await admin
    .from("vendor_waitlist")
    .select("id, email_normalized, invite_consent, unsubscribed_at, first_name, business_name, category, suburb")
    .in("email_normalized", rows.map((r) => r.email.toLowerCase()));
  const byEmail = new Map((existing ?? []).map((e) => [e.email_normalized, e]));
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  const failed: string[] = [];

  const inserts = rows
    .filter((r) => !byEmail.has(r.email.toLowerCase()))
    .map((r) => ({
      email: r.email,
      first_name: r.first_name,
      business_name: r.business_name,
      category: r.category,
      suburb: r.suburb,
      source: "import",
      invite_consent: r.invite_consent,
      consent_at: r.invite_consent ? now : null,
      consent_note: r.consent_note ?? (r.invite_consent ? "Imported from waitlist CSV (consent column)" : null),
    }));
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { error } = await admin.from("vendor_waitlist").insert(chunk);
    if (error) failed.push(`Rows ${i + 1}–${i + chunk.length}: ${error.message}`);
    else added += chunk.length;
  }

  for (const r of rows) {
    const e = byEmail.get(r.email.toLowerCase());
    if (!e) continue;
    const patch: Record<string, unknown> = {};
    // Fill gaps only; an admin's earlier data wins.
    if (!e.first_name && r.first_name) patch.first_name = r.first_name;
    if (!e.business_name && r.business_name) patch.business_name = r.business_name;
    if (!e.category && r.category) patch.category = r.category;
    if (!e.suburb && r.suburb) patch.suburb = r.suburb;
    if (r.invite_consent && !e.invite_consent && !e.unsubscribed_at) {
      patch.invite_consent = true;
      patch.consent_at = now;
      patch.consent_note = r.consent_note ?? "Imported from waitlist CSV (consent column)";
    }
    if (Object.keys(patch).length === 0) continue;
    const { error } = await admin.from("vendor_waitlist").update({ ...patch, updated_at: now }).eq("id", e.id);
    if (error) failed.push(`${r.email}: ${error.message}`);
    else updated++;
  }

  revalidatePath(PATH);
  const consented = rows.filter((r) => r.invite_consent).length;
  return {
    success: failed.length === 0,
    message: `Imported ${rows.length} rows: ${added} new, ${updated} updated, ${consented} with invitation consent.`,
    details: [...errors, ...failed].slice(0, 30),
  };
}

let resendClient: Resend | null = null;
function resend() {
  if (!process.env.RESEND_API_KEY) return null;
  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends (or resends) invitations to the given waitlist contacts, one at a
 * time. Refuses unless BETA_INVITES_LIVE=true. Each send is prepared in the
 * database first (consent, unsubscribes, duplicates, daily limit, one send in
 * flight per contact) and Resend gets an idempotency key, so a double click
 * or a retry can't email anyone twice.
 */
export async function sendInvitations(waitlistIds: string[]): Promise<AdminFoundingState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const status = inviteSendingStatus();
  if (!status.live) return { error: "Live sending is switched off (BETA_INVITES_LIVE isn't true). Send a test email instead." };
  const client = resend();
  if (!client || !status.from) return { error: "Resend isn't configured (RESEND_API_KEY / EMAIL_FROM)." };

  const ids = [...new Set(waitlistIds)].filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (ids.length === 0) return { error: "Pick at least one contact." };

  const supabase = await createClient();
  const { data: program } = await supabase.from("beta_program").select("batch_size_limit").eq("id", 1).maybeSingle();
  const batchLimit = program?.batch_size_limit ?? 10;
  if (ids.length > batchLimit) return { error: `Batches are limited to ${batchLimit}. Change it in Program settings.` };

  let sent = 0;
  const problems: string[] = [];
  for (const [i, id] of ids.entries()) {
    if (i > 0) await pause(600); // stays under Resend's per-second rate limit
    const { token, hash } = newInviteToken();
    const { data: prepared, error: prepError } = await supabase.rpc("admin_prepare_beta_invitation", {
      p_waitlist_id: id,
      p_token_hash: hash,
    });
    const row = prepared?.[0];
    if (prepError || !row) {
      problems.push(`${id.slice(0, 8)}: ${prepError?.message ?? "not prepared"}`);
      // The daily limit applies to everything after it too.
      if (prepError?.message.includes("Daily limit")) break;
      continue;
    }

    const email = renderInviteEmail({
      firstName: row.first_name,
      token,
      unsubscribeToken: row.unsubscribe_token,
      expiresAt: new Date(row.expires_at),
    });
    try {
      const { data, error } = await client.emails.send(
        {
          from: status.from,
          to: row.email,
          replyTo: status.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: inviteHeaders(row.unsubscribe_token),
          tags: [{ name: "campaign", value: "founding_vendors" }],
        },
        { idempotencyKey: `beta-invite-${row.invitation_id}-${row.send_number}` },
      );
      if (error || !data?.id) throw new Error(error ? `${error.name}: ${error.message}` : "No email id returned");
      await supabase.rpc("admin_record_beta_invitation", { p_invitation_id: row.invitation_id, p_ok: true, p_resend_email_id: data.id });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase.rpc("admin_record_beta_invitation", { p_invitation_id: row.invitation_id, p_ok: false, p_error: message });
      problems.push(`${row.email}: ${message}`);
      // Rate limited or quota reached: stop instead of failing the rest one by one.
      if (/rate_limit|quota|daily_quota|too many|429/i.test(message)) break;
    }
  }

  revalidatePath(PATH);
  return {
    success: problems.length === 0,
    message: `Sent ${sent} of ${ids.length} invitation${ids.length === 1 ? "" : "s"}.`,
    details: problems,
  };
}

/** The next N invitable contacts who haven't been invited yet, oldest first. */
export async function sendNextBatch(count: number): Promise<AdminFoundingState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const n = Math.max(1, Math.min(100, Math.floor(Number(count) || 0)));
  const supabase = await createClient();
  const [{ data: contacts }, { data: invited }] = await Promise.all([
    supabase.from("vendor_waitlist").select("id").eq("invite_consent", true).is("unsubscribed_at", null).order("created_at").limit(2000),
    supabase.from("beta_invitations").select("waitlist_id"),
  ]);
  const done = new Set((invited ?? []).map((i) => i.waitlist_id));
  const ids = (contacts ?? []).map((c) => c.id).filter((id) => !done.has(id)).slice(0, n);
  if (ids.length === 0) return { error: "Everyone with consent has already been invited." };
  return sendInvitations(ids);
}

/** Sends the real template (with a non-working preview link) to the signed-in admin only. */
export async function sendTestInvitation(): Promise<AdminFoundingState> {
  const session = await requireAdmin();
  if (!session) return { error: "Not authorized." };
  const to = session.user.email;
  if (!to) return { error: "Your account has no email address." };
  const status = inviteSendingStatus();
  const client = resend();
  if (!client || !status.from) return { error: "Resend isn't configured (RESEND_API_KEY / EMAIL_FROM)." };

  const email = renderInviteEmail({
    firstName: (session.user.user_metadata.full_name as string | undefined) ?? "Mohnish",
    token: null,
    unsubscribeToken: null,
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
  });
  try {
    const { error } = await client.emails.send({
      from: status.from,
      to,
      replyTo: status.replyTo,
      subject: `[TEST] ${email.subject}`,
      html: email.html,
      text: email.text,
      tags: [{ name: "campaign", value: "founding_vendors_test" }],
    });
    if (error) return { error: `Resend refused it: ${error.message}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  return { success: true, message: `Test email sent to ${to}. Check the inbox (and spam) before sending to the waitlist.` };
}

export async function decideApplication(
  applicationId: string,
  decision: "approved" | "needs_changes" | "rejected",
  note?: string,
): Promise<AdminFoundingState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!["approved", "needs_changes", "rejected"].includes(decision)) return { error: "Unknown decision." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_decide_founding_application", {
    p_application_id: applicationId,
    p_decision: decision,
    p_note: note?.trim() || undefined,
  });
  if (error) return { error: error.message };

  await emailDecision(applicationId, decision, note?.trim() || null);
  revalidatePath(PATH);
  revalidatePath("/admin", "layout");
  revalidatePath("/founding-vendors");
  revalidatePath("/explore");
  return { success: true };
}

// The applicant's email isn't readable with the admin's session in every
// table, so look it up with the service role (as emailListingLive does).
async function emailDecision(applicationId: string, decision: string, note: string | null) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: app } = await admin.from("beta_applications").select("user_id").eq("id", applicationId).maybeSingle();
  if (!app) return;
  const { data: found } = await admin.auth.admin.getUserById(app.user_id);
  const to = found?.user?.email;
  if (!to) return;

  if (decision === "approved") {
    notify({
      to,
      category: "bookings",
      subject: "You're an Evntly founding vendor",
      heading: "Welcome to the founding vendor beta",
      lines: [
        "Your listing has been approved and is now live, so customers can find you on Explore and send you quote requests.",
        "We've put a short checklist on your dashboard to help you try listings, leads, quotes and bookings, and there's a feedback form for anything that could work better.",
      ],
      cta: { label: "Open my beta checklist", path: "/vendor-dashboard/beta" },
    });
  } else if (decision === "needs_changes") {
    notify({
      to,
      category: "bookings",
      subject: "A few changes to your Evntly listing",
      heading: "Your listing needs a few changes",
      lines: ["Thanks for applying to the founding vendor beta. Before we can approve your listing, please update the following:"],
      quote: note,
      cta: { label: "See what to change", path: CLAIM_PATH },
    });
  } else {
    notify({
      to,
      category: "bookings",
      subject: "Your Evntly founding vendor application",
      heading: "About your founding vendor application",
      lines: [
        "Thanks for applying to the Evntly founding vendor beta. We weren't able to offer you a place this time.",
        "Your account stays open. If you have questions, reply to hello@evntlyapp.com.",
      ],
      quote: note,
      cta: { label: "View your application", path: CLAIM_PATH },
    });
  }
}

export async function setBetaProgram(_prev: AdminFoundingState, formData: FormData): Promise<AdminFoundingState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const num = (k: string) => Math.floor(Number(formData.get(k)));
  const capacity = num("capacity");
  const expiry = num("invite_expiry_days");
  const daily = num("daily_send_limit");
  const batch = num("batch_size_limit");
  if (![capacity, expiry, daily, batch].every(Number.isFinite)) return { error: "Enter whole numbers." };
  if (capacity < 0 || capacity > 1000) return { error: "Capacity must be 0–1000." };
  if (expiry < 1 || expiry > 90) return { error: "Invitation expiry must be 1–90 days." };
  if (daily < 1 || daily > 1000) return { error: "Daily limit must be 1–1000." };
  if (batch < 1 || batch > 100) return { error: "Batch size must be 1–100." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_beta_program", {
    p_capacity: capacity,
    p_invite_expiry_days: expiry,
    p_daily_send_limit: daily,
    p_batch_size_limit: batch,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  revalidatePath("/founding-vendors");
  return { success: true, message: "Saved." };
}

export async function setFeedbackStatus(id: string, status: "new" | "reviewed" | "resolved"): Promise<AdminFoundingState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!["new", "reviewed", "resolved"].includes(status)) return { error: "Unknown status." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("beta_feedback").update({ status }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Feedback not found." };
  revalidatePath(PATH);
  return { success: true };
}
