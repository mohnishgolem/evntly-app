"use server";

import { z } from "zod";
import { isLaunchCategory } from "@/lib/config";
import { checkRateLimit, clientIp, RATE_LIMIT_ERROR } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/phone-agent/phone";
import { CALL_REQUEST_CONSENT } from "@/lib/phone-agent/call-request";

// "Request a call" on /become-a-vendor/call. Records the vendor's own express
// consent (the exact wording above, ticked by them, not pre-ticked) and adds
// them to the outreach tracker. Nothing dials automatically: the call is
// placed from Admin → Phone agent, within calling hours.

/** values: what was typed, so the form can be refilled after an error (React resets it). */
export type CallRequestState = { error?: string; success?: boolean; values?: Record<string, string> } | null;

const schema = z.object({
  businessName: z.string().trim().min(1, "Enter your business name.").max(160),
  name: z.string().trim().max(80).optional(),
  category: z.string().refine((c) => c === "" || isLaunchCategory(c), "Pick what you do."),
  phone: z.string().trim().min(8, "Enter your mobile or business number."),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Check your email address.")]),
  preferredTime: z.enum(["morning", "afternoon", "any"]),
  consent: z.literal("yes", { message: "Tick the box so we can call you." }),
});

export async function requestCall(_prev: CallRequestState, form: FormData): Promise<CallRequestState> {
  if (String(form.get("website") ?? "")) return { success: true }; // honeypot
  const values = Object.fromEntries(
    ["businessName", "name", "category", "phone", "email", "preferredTime"].map((k) => [k, String(form.get(k) ?? "").slice(0, 200)]),
  );
  const fail = (error: string): CallRequestState => ({ error, values });
  const parsed = schema.safeParse({
    businessName: form.get("businessName") ?? "",
    name: form.get("name") ?? "",
    category: form.get("category") ?? "",
    phone: form.get("phone") ?? "",
    email: form.get("email") ?? "",
    preferredTime: form.get("preferredTime") ?? "any",
    consent: form.get("consent") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const phone = toE164(parsed.data.phone);
  if (!phone) return fail("Enter an Australian mobile or landline number.");

  if (!(await checkRateLimit("callRequestIp", await clientIp())) || !(await checkRateLimit("callRequestPhone", phone))) {
    return fail(RATE_LIMIT_ERROR);
  }
  const admin = createAdminClient();
  if (!admin) return fail("Something went wrong. Please email hello@evntlyapp.com.");
  const { error } = await (admin as unknown as { rpc: (fn: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }> }).rpc(
    "phone_request_callback",
    {
      p_phone: phone,
      p_business_name: parsed.data.businessName,
      p_contact_name: parsed.data.name || null,
      p_category: parsed.data.category || null,
      p_email: parsed.data.email || null,
      p_preferred_time: parsed.data.preferredTime,
      p_source: "website",
      p_consent_text: CALL_REQUEST_CONSENT,
    },
  );
  if (error) {
    console.error("[call-request] failed:", error.message);
    return fail("Something went wrong. Please email hello@evntlyapp.com.");
  }
  return { success: true };
}
