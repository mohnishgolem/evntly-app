"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailAdmins, emailApplicationReceived } from "@/lib/founding/notify";
import { checkRateLimit, clientIp, RATE_LIMIT_ERROR } from "@/lib/rate-limit";
import { hashInviteToken, looksLikeInviteToken } from "@/lib/founding/tokens";
import { CLAIM_PATH, isFoundingSource, SOURCE_COOKIE } from "@/lib/founding/sources";
import { isVendorCategory } from "@/lib/config";

export type FoundingActionState = { error?: string; success?: boolean; message?: string } | null;

// The invite token and source come from the claim page's hidden fields (the
// URL the vendor arrived on). Neither grants anything: the RPC only uses the
// invite for tracking when it belongs to the signed-in account's email.
export async function claimFoundingPlace(_prev: FoundingActionState, formData: FormData): Promise<FoundingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to claim your place." };

  const invite = formData.get("invite")?.toString();
  const formSource = formData.get("source")?.toString();
  const cookieSource = (await cookies()).get(SOURCE_COOKIE)?.value;
  const source = isFoundingSource(formSource) ? formSource : isFoundingSource(cookieSource) ? cookieSource : "direct";

  const { data, error } = await supabase.rpc("claim_founding_vendor_place", {
    p_invite_token_hash: looksLikeInviteToken(invite) ? hashInviteToken(invite) : undefined,
    p_source: source,
  });
  if (error || !data?.[0]) {
    console.error("[founding] claim failed:", error?.message);
    return { error: error?.message.includes("suspended") ? "This account is suspended." : "We couldn't save your claim. Please try again." };
  }

  const result = data[0];
  // First claim by an existing vendor (listing already there): confirm by email.
  if (result.created && result.status === "submitted") await emailApplicationReceived(user.email);

  revalidatePath(CLAIM_PATH);
  return { success: true };
}

export async function updateMyFoundingApplication(action: "resubmit" | "withdraw" | "rejoin"): Promise<FoundingActionState> {
  if (!["resubmit", "withdraw", "rejoin"].includes(action)) return { error: "Unknown action." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_my_founding_application", { p_action: action });
  if (error) return { error: error.message };
  if (data === "submitted" && action === "resubmit") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await emailAdmins("A founding vendor resubmitted", `${user?.email ?? "A vendor"} updated their listing after your notes.`);
  }
  revalidatePath(CLAIM_PATH);
  revalidatePath("/vendor-dashboard", "layout");
  return { success: true };
}

const waitlistSchema = z.object({
  email: z.email("Enter a valid email").max(254),
  firstName: z.string().trim().min(1, "Enter your first name").max(80),
  businessName: z.string().trim().max(160).optional(),
  category: z.string().trim().max(40).optional(),
  consent: z.literal("on", { error: "Tick the box so we can email you when a place opens." }),
});

// Public form (shown when places are full, and as a secondary option).
// Always answers the same way, so it can't be used to check who's on the list.
export async function joinVendorWaitlist(_prev: FoundingActionState, formData: FormData): Promise<FoundingActionState> {
  if (formData.get("website")) return { success: true, message: "Thanks! You're on the list." }; // honeypot
  const parsed = waitlistSchema.safeParse({
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    businessName: formData.get("businessName") || undefined,
    category: formData.get("category") || undefined,
    consent: formData.get("consent") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  if (!(await checkRateLimit("waitlistIp", await clientIp()))) return { error: RATE_LIMIT_ERROR };

  const admin = createAdminClient();
  if (!admin) return { error: "The waitlist isn't available right now. Please email hello@evntlyapp.com." };
  const { email, firstName, businessName, category } = parsed.data;
  const now = new Date().toISOString();
  const consentNote = "Ticked the founding vendor waitlist box on evntlyapp.com/founding-vendors";

  const { data: existing } = await admin
    .from("vendor_waitlist")
    .select("id")
    .eq("email_normalized", email.trim().toLowerCase())
    .maybeSingle();
  const { error } = existing
    ? // Ticking the box again is fresh consent, even after an unsubscribe.
      await admin
        .from("vendor_waitlist")
        .update({ invite_consent: true, consent_at: now, consent_note: consentNote, unsubscribed_at: null, updated_at: now })
        .eq("id", existing.id)
    : await admin.from("vendor_waitlist").insert({
        email: email.trim(),
        first_name: firstName,
        business_name: businessName ?? null,
        category: category && isVendorCategory(category) ? category : null,
        source: "founding_page",
        invite_consent: true,
        consent_at: now,
        consent_note: consentNote,
      });
  if (error) {
    console.error("[founding] waitlist join failed:", error.message);
    return { error: "We couldn't add you just now. Please try again." };
  }
  return { success: true, message: "Thanks! You're on the list — we'll email you if a founding place opens up." };
}

const feedbackSchema = z.object({
  kind: z.enum(["feedback", "bug"]),
  area: z.enum(["listing", "enquiries", "quotes", "bookings", "messages", "other"]),
  message: z.string().trim().min(5, "Tell us a little more (5+ characters).").max(4000),
  page: z.string().trim().max(300).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export async function submitBetaFeedback(_prev: FoundingActionState, formData: FormData): Promise<FoundingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to send feedback." };

  const parsed = feedbackSchema.safeParse({
    kind: formData.get("kind"),
    area: formData.get("area") || "other",
    message: formData.get("message"),
    page: formData.get("page") || undefined,
    rating: formData.get("rating") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  if (!(await checkRateLimit("betaFeedbackUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { error } = await supabase.from("beta_feedback").insert({
    kind: parsed.data.kind,
    area: parsed.data.area,
    message: parsed.data.message,
    page: parsed.data.page ?? null,
    rating: parsed.data.rating ?? null,
  });
  if (error) return { error: "We couldn't send that. Feedback is open to founding vendor applicants." };

  revalidatePath("/vendor-dashboard/beta");
  return { success: true, message: parsed.data.kind === "bug" ? "Thanks — bug reported. We'll look into it." : "Thanks for the feedback!" };
}

export async function unsubscribeFromInvites(_prev: FoundingActionState, formData: FormData): Promise<FoundingActionState> {
  const token = formData.get("t")?.toString() ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "This unsubscribe link isn't valid. Email hello@evntlyapp.com and we'll remove you." };
  if (!(await checkRateLimit("unsubscribeIp", await clientIp()))) return { error: RATE_LIMIT_ERROR };
  const supabase = await createClient();
  const { error } = await supabase.rpc("beta_unsubscribe", { p_token: token });
  if (error) return { error: "Something went wrong. Email hello@evntlyapp.com and we'll remove you." };
  // Same answer whether or not the token matched a contact.
  return { success: true, message: "You're unsubscribed. We won't email you about the founding vendor beta again." };
}
