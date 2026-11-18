"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recordFunnelEvent } from "@/lib/funnel-events";
import { emailAdmins, emailApplicationReceived } from "@/lib/founding/notify";
import { CLAIM_PATH } from "@/lib/founding/sources";
import { FINISH_PATH } from "@/lib/listing-completion";

export type CompletionActionState = { error?: string; success?: boolean } | null;

// Database messages from submit_listing_for_review() are written for the
// vendor (P0001); anything else gets a generic line.
function vendorMessage(error: { code?: string; message: string }) {
  return error.code === "P0001" || error.code === "42501" ? error.message : "Something went wrong. Please try again.";
}

/**
 * The vendor sends their finished draft for review. The database checks that
 * it is theirs, still a draft and has at least 3 photos and 1 active package.
 */
export async function submitListingForReview(providerId: string): Promise<CompletionActionState> {
  if (typeof providerId !== "string" || !providerId) return { error: "Listing not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Log in first." };

  const { data, error } = await supabase.rpc("submit_listing_for_review", { p_provider_id: providerId });
  if (error) return { error: vendorMessage(error) };

  revalidatePath("/vendor-dashboard", "layout");
  revalidatePath(CLAIM_PATH);

  if (data === "founding_submitted") {
    await recordFunnelEvent("listing_submitted");
    // Confirms to the vendor and tells admins.
    await emailApplicationReceived(user.email);
    redirect(CLAIM_PATH);
  }
  if (data === "pending_review") {
    await recordFunnelEvent("listing_submitted");
    await emailAdmins("New vendor to approve", `${user.email} submitted a complete listing (photos and a package).`, {
      label: "Review approvals",
      path: "/admin/approvals",
    });
  }
  redirect(FINISH_PATH);
}

// ── Done-with-you setup (R5) ────────────────────────────────────────────

const setupSchema = z.object({
  services: z
    .string()
    .trim()
    .min(10, "Tell us a little about your services and prices (at least 10 characters).")
    .max(2000, "Keep it under 2,000 characters."),
  photoLinks: z.string().trim().max(1000, "Keep the links under 1,000 characters."),
  permission: z.literal(true, { error: "Please confirm we may use these photos on your listing." }),
});

export type SetupRequestInput = z.input<typeof setupSchema>;

/**
 * "Set it up for me": the vendor sends their services, prices and where to
 * find their photos. Our team prepares the photos and packages on their
 * draft, then emails them to check it; the vendor submits it themselves.
 */
export async function requestListingSetup(providerId: string, input: SetupRequestInput): Promise<CompletionActionState> {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (typeof providerId !== "string" || !providerId) return { error: "Listing not found." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Log in first." };

  // RLS: only the owner of a draft listing can ask, one open request at a time.
  const { error } = await supabase.from("listing_setup_requests").insert({
    provider_id: providerId,
    user_id: user.id,
    services: parsed.data.services,
    photo_links: parsed.data.photoLinks || null,
    photo_permission: true,
  });
  if (error) {
    if (error.code === "23505") return { error: "We already have your request. We'll email you when your listing is ready to check." };
    return { error: "We couldn't send your request. Please try again." };
  }

  await emailAdmins("A vendor asked us to set up their listing", `${user.email} sent their services and photos. Open Setup requests to prepare the listing.`, {
    label: "Open setup requests",
    path: "/admin/setup-requests",
  });
  revalidatePath(FINISH_PATH);
  return { success: true };
}
