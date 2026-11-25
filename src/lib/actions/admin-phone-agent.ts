"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { missingConfig, phoneAgentConfig } from "@/lib/phone-agent/config";
import { toE164 } from "@/lib/phone-agent/phone";
import { callVariables } from "@/lib/phone-agent/prompt";
import { createRetellCall } from "@/lib/phone-agent/retell";

// Admin → Phone agent. Every action runs as the signed-in admin (MFA); the
// database functions check is_admin() and enforce the calling rules again.
// Placing a call is the only thing that talks to Retell, and only after the
// database has created the call row (every rule passed).

const PATH = "/admin/phone-agent";
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

async function adminRpc(): Promise<Rpc> {
  const { admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") redirect(`${PATH}?msg=${encodeURIComponent("Not authorized.")}`);
  const supabase = await createClient();
  return supabase.rpc.bind(supabase) as unknown as Rpc;
}

function done(msg: string): never {
  revalidatePath(PATH);
  redirect(`${PATH}?msg=${encodeURIComponent(msg.slice(0, 300))}`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function updatePhoneAgentSettings(form: FormData) {
  const rpc = await adminRpc();
  const numbers = str(form, "prototype_numbers").split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
  const e164 = numbers.map(toE164);
  if (e164.some((n) => !n)) done("Prototype numbers must be Australian numbers.");
  const transfer = str(form, "owner_transfer_number");
  if (transfer && !toE164(transfer)) done("Transfer number must be an Australian number.");
  const budget = Number(str(form, "budget_aud"));
  const p: Record<string, unknown> = {
    mode: str(form, "mode"),
    prototype_numbers: e164,
    owner_name: str(form, "owner_name") || "Sai",
    owner_transfer_number: transfer ? toE164(transfer) : "",
    call_start: str(form, "call_start") || undefined,
    call_end: str(form, "call_end") || undefined,
    transfer_start: str(form, "transfer_start") || undefined,
    transfer_end: str(form, "transfer_end") || undefined,
    pilot_max_calls: Number(str(form, "pilot_max_calls")) || undefined,
    daily_call_cap: Number(str(form, "daily_call_cap")) || undefined,
    budget_aud_cents: Number.isFinite(budget) && budget >= 0 ? Math.round(budget * 100) : undefined,
  };
  const { error } = await rpc("admin_phone_update_settings", { p: JSON.parse(JSON.stringify(p)) });
  done(error ? `Couldn't save: ${error.message}` : "Settings saved.");
}

export async function startPhoneAgentCall(form: FormData) {
  const rpc = await adminRpc();
  const cfg = phoneAgentConfig();
  const missing = missingConfig(cfg);
  if (missing.length) done(`Not set up yet. Missing: ${missing.join(", ")}.`);

  const prospectId = str(form, "prospect_id") || null;
  const phone = toE164(str(form, "phone"));
  if (!phone) done("Enter an Australian phone number.");

  const started = await rpc("admin_phone_start_call", { p_prospect_id: prospectId, p_phone: phone });
  if (started.error) done(started.error.message);
  const row = (started.data as { call_id: string; ref: string; vendor_name: string | null; contact_first_name: string | null; category: string | null; mode: "prototype" | "pilot" }[])[0];

  const settings = await (await createClient()).from("phone_agent_settings" as never).select("owner_name, recording_enabled").maybeSingle();
  const s = (settings.data ?? {}) as { owner_name?: string; recording_enabled?: boolean };
  const vars = callVariables({
    ref: row.ref,
    mode: row.mode,
    vendorName: row.vendor_name,
    firstName: row.contact_first_name,
    category: row.category,
    ownerName: s.owner_name ?? "Sai",
    callbackNumber: cfg.fromNumber!,
    recordingOn: !!s.recording_enabled,
  });
  const res = await createRetellCall({ apiKey: cfg.retellApiKey!, agentId: cfg.retellAgentId!, from: cfg.fromNumber!, to: phone!, vars });
  if ("error" in res) {
    await rpc("admin_phone_call_dialed", { p_call_id: row.call_id, p_provider_call_id: null, p_error: res.error });
    done(`Call failed to start: ${res.error}`);
  }
  await rpc("admin_phone_call_dialed", { p_call_id: row.call_id, p_provider_call_id: res.callId, p_error: null });
  done(`Calling now (ref ${row.ref}). Results appear here when the call ends.`);
}

export async function recordPhoneConsent(form: FormData) {
  const rpc = await adminRpc();
  const phone = toE164(str(form, "phone"));
  if (!phone) done("Enter an Australian phone number.");
  const { error } = await rpc("admin_phone_record_consent", {
    p_prospect_id: str(form, "prospect_id"),
    p_phone: phone,
    p_basis: str(form, "basis"),
    p_evidence: str(form, "evidence"),
  });
  done(error ? error.message : "Consent recorded.");
}

export async function recordDncrCheck(form: FormData) {
  const rpc = await adminRpc();
  const phone = toE164(str(form, "phone"));
  if (!phone) done("Enter an Australian phone number.");
  const onRegister = str(form, "on_register") === "yes";
  const { error } = await rpc("admin_phone_record_dncr", { p_phone: phone, p_on_register: onRegister, p_method: str(form, "method") || "quick_check", p_reference: str(form, "reference") || null });
  done(error ? error.message : onRegister ? "On the register: added to the permanent do-not-call list." : "DNCR check recorded (valid 30 days).");
}

export async function suppressPhone(form: FormData) {
  const rpc = await adminRpc();
  const phone = toE164(str(form, "phone"));
  if (!phone) done("Enter an Australian phone number.");
  const { error } = await rpc("admin_phone_suppress", { p_phone: phone, p_reason: str(form, "reason") || "Added by admin" });
  done(error ? error.message : "Added to the permanent do-not-call list.");
}

export async function reviewPhoneCall(form: FormData) {
  const rpc = await adminRpc();
  const score = Number(str(form, "score"));
  if (!Number.isInteger(score) || score < 1 || score > 5) done("Score 1–5.");
  const { error } = await rpc("admin_phone_review_call", { p_call_id: str(form, "call_id"), p_score: score, p_note: str(form, "note") || null });
  done(error ? error.message : "Review saved.");
}

export async function completePhoneFollowup(form: FormData) {
  const rpc = await adminRpc();
  const { error } = await rpc("admin_phone_followup_done", { p_id: Number(str(form, "id")), p_status: str(form, "status") || "done" });
  done(error ? error.message : "Updated.");
}

/** An Instagram / Facebook / email reply that says yes to a call: recorded with the quote. */
export async function recordSocialCallRequest(form: FormData) {
  const rpc = await adminRpc();
  const phone = toE164(str(form, "phone"));
  if (!phone) done("Enter an Australian phone number.");
  const quote = str(form, "evidence");
  if (quote.length < 20) done("Paste what they wrote, with the date (at least 20 characters).");
  const { error } = await rpc("admin_phone_request_callback", {
    p_phone: phone,
    p_business_name: str(form, "business_name"),
    p_contact_name: str(form, "contact_name") || null,
    p_category: str(form, "category") || null,
    p_email: str(form, "email") || null,
    p_source: str(form, "source") || "instagram",
    p_consent_text: quote,
  });
  done(error ? error.message : "Call request and consent recorded. Do the Do Not Call Register check, then call from Pilot.");
}

export async function setCallRequestStatus(form: FormData) {
  const rpc = await adminRpc();
  const { error } = await rpc("admin_phone_request_status", { p_id: Number(str(form, "id")), p_status: str(form, "status") });
  done(error ? error.message : "Updated.");
}
