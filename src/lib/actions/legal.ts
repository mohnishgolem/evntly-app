"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/data/user";
import { sendEmail } from "@/lib/email";
import { USER_DOCUMENTS, VENDOR_DOCUMENTS } from "@/lib/legal/versions";

export type LegalActionState = { error?: string; ok?: boolean } | null;

const DOCUMENTS = [...USER_DOCUMENTS, ...VENDOR_DOCUMENTS] as const;

const acceptSchema = z.object({
  documents: z.array(z.enum(DOCUMENTS)).min(1).max(5),
  context: z.enum(["signup_google", "terms_update", "vendor_onboarding"]),
  // Only sent when the person was shown the marketing choice (first-time
  // acceptance after Google sign-up). Undefined = don't record anything.
  marketing: z.boolean().optional(),
});

/** Records acceptance of the current version of each document (server timestamp, append-only). */
export async function acceptLegalDocuments(input: z.input<typeof acceptSchema>): Promise<LegalActionState> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { error: "Something went wrong. Please try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_legal_acceptance", {
    p_documents: [...new Set(parsed.data.documents)],
    p_context: parsed.data.context,
  });
  if (error) {
    console.error("[legal] record_legal_acceptance failed:", error.message);
    return { error: "We couldn't save that. Please try again." };
  }
  if (parsed.data.marketing !== undefined) {
    await supabase.rpc("set_marketing_consent", { p_granted: parsed.data.marketing, p_context: parsed.data.context });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setMarketingConsent(granted: boolean): Promise<LegalActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_marketing_consent", { p_granted: granted, p_context: "settings" });
  if (error) return { error: "We couldn't save that. Please try again." };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/**
 * Called by signup after it has validated the required checkboxes. Uses the
 * service role so acceptance is never taken from client-supplied metadata.
 * Never throws: if it fails, the person is asked to accept on first sign-in.
 */
export async function recordSignupConsents(userId: string, role: "customer" | "vendor", marketing: boolean) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      console.error("[legal] service role key missing; signup consent not recorded (user will be prompted)");
      return;
    }
    const { error } = await admin.rpc("record_signup_consents", {
      p_user_id: userId,
      p_role: role,
      p_marketing: marketing,
    });
    if (error) console.error("[legal] record_signup_consents failed:", error.message);
  } catch (err) {
    console.error("[legal] record_signup_consents threw:", err);
  }
}

const deletionSchema = z.object({ reason: z.string().max(1000).optional() });

export async function requestAccountDeletion(input: z.input<typeof deletionSchema>): Promise<LegalActionState> {
  const parsed = deletionSchema.safeParse(input);
  if (!parsed.success) return { error: "Please keep the reason under 1,000 characters." };
  const session = await getCurrentUser();
  if (!session) return { error: "Please log in again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_deletion", { p_reason: parsed.data.reason ?? "" });
  if (error) return { error: "We couldn't send your request. Please email hello@evntlyapp.com." };

  // Tell the admins (deletion is completed manually; see Privacy Policy s12).
  const admin = createAdminClient();
  if (admin) {
    const { data: admins } = await admin.from("users").select("email").eq("role", "admin");
    for (const a of admins ?? []) {
      if (!a.email) continue;
      void sendEmail({
        to: a.email,
        subject: "Account deletion request",
        heading: "A user asked to delete their account",
        lines: [
          `Account: ${session.user.email ?? session.user.id} (${session.profile?.role ?? "customer"})`,
          "Check for open bookings or disputes, then delete or de-identify their data in line with the Privacy Policy.",
        ],
        quote: parsed.data.reason || null,
        cta: { label: "Open admin", path: "/admin" },
      });
    }
  }
  revalidatePath("/dashboard/settings/delete-account");
  return { ok: true };
}

export async function cancelAccountDeletion(): Promise<LegalActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) return { error: "We couldn't cancel your request. Please email hello@evntlyapp.com." };
  revalidatePath("/dashboard/settings/delete-account");
  return { ok: true };
}
