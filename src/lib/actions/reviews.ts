"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMIT_ERROR } from "@/lib/rate-limit";
import { z } from "zod";
import { EVENT_TYPES } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, sendEmail } from "@/lib/email";
import { getAdminSession } from "@/lib/data/user";
import {
  friendlyReviewError,
  PAST_CLIENT_COMMENT_MAX,
  PAST_CLIENT_COMMENT_MIN,
  reviewerDisplayName,
} from "@/lib/past-client-reviews";

export type ActionState = { error?: string; success?: boolean } | null;

export async function submitReview(
  providerId: string,
  bookingId: string,
  eventType: string | null,
  rating: number,
  comment: string
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Choose a rating from 1 to 5." };
  if (comment.length > 2000) return { error: "That review is too long." };
  if (!(await checkRateLimit("reviewUser", user.id))) return { error: RATE_LIMIT_ERROR };

  // Only the customer on a completed booking with this vendor may review it,
  // once. (Also enforced in the DB by the reviews insert trigger.)
  const { data: booking } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .eq("provider_id", providerId)
    .eq("client_user_id", user.id)
    .eq("status", "completed")
    .maybeSingle();
  if (!booking) return { error: "You can only review a vendor after a completed booking." };

  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("reviewer_user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existing) return { error: "You've already reviewed this booking." };

  const { error } = await supabase.from("reviews").insert({
    provider_id: providerId,
    booking_id: bookingId,
    reviewer_email: user.email,
    reviewer_name: user.user_metadata?.full_name ?? null,
    rating,
    comment: comment || null,
    event_type: eventType,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/bookings");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Past-client reviews (clients who booked the vendor outside Evntly)
// ---------------------------------------------------------------------------

const pastClientSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(PAST_CLIENT_COMMENT_MIN).max(PAST_CLIENT_COMMENT_MAX),
  eventType: z.enum(EVENT_TYPES).nullable(),
  confirmed: z.literal(true),
});
export type PastClientReviewInput = z.input<typeof pastClientSchema>;

/**
 * A past client reviews a vendor. Needs a signed-in, verified account; the
 * database checks the rest again (live listing, not their own, once per
 * vendor, 5 a day). Goes live straight away, labelled "Past client".
 */
export async function submitPastClientReview(providerId: string, input: PastClientReviewInput): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Create a free account or log in to post your review." };

  const parsed = pastClientSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "confirmed") return { error: "Please confirm you hired this vendor yourself." };
    if (field === "comment") return { error: friendlyReviewError("20 to 2,000") };
    return { error: "Choose a rating from 1 to 5." };
  }
  if (!(await checkRateLimit("reviewUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { data: vendor } = await supabase.from("service_providers").select("id, name, status, is_demo").eq("id", providerId).maybeSingle();
  if (!vendor || vendor.status !== "approved" || vendor.is_demo) return { error: friendlyReviewError("can't receive reviews") };

  const { rating, comment, eventType } = parsed.data;
  const { error } = await supabase.from("reviews").insert({
    provider_id: providerId,
    reviewer_email: user.email,
    reviewer_user_id: user.id,
    reviewer_name: reviewerDisplayName(user.user_metadata?.full_name as string | undefined),
    rating,
    comment,
    event_type: eventType,
    source: "past_client",
  });
  if (error) return { error: friendlyReviewError(error.message) };

  await notifyPastClientReview(providerId, vendor.name, rating, comment);
  revalidatePath(`/vendor/${providerId}`);
  return { success: true };
}

// The vendor hears about their new review; admins get a copy so they can
// hide one that looks fake. Email addresses are only readable with the
// service role.
async function notifyPastClientReview(providerId: string, vendorName: string, rating: number, comment: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const [{ data: v }, { data: admins }] = await Promise.all([
    admin.from("service_providers").select("owner_email").eq("id", providerId).maybeSingle(),
    admin.from("users").select("email").eq("role", "admin"),
  ]);
  const stars = `${rating} star${rating === 1 ? "" : "s"}`;
  notify({
    to: v?.owner_email,
    category: "bookings",
    subject: `New review for ${vendorName}: ${stars}`,
    heading: "A past client reviewed you",
    lines: [`You have a new ${stars} review on Evntly. It's on your profile now, marked as from a past client.`],
    quote: comment,
    cta: { label: "See your profile", path: `/vendor/${providerId}` },
  });
  for (const a of admins ?? []) {
    if (!a.email) continue;
    void sendEmail({
      to: a.email,
      subject: `Past-client review: ${vendorName} (${stars})`,
      heading: "New past-client review",
      lines: [`${vendorName} received a ${stars} review from a past client. It's live now. Hide it in Admin if it looks fake.`],
      quote: comment,
      cta: { label: "Review in Admin", path: "/admin/reviews" },
    });
  }
}

/** Admins hide (or restore) a review: off the profile and out of the rating. */
export async function setReviewHidden(reviewId: string, hidden: boolean, reason = ""): Promise<ActionState> {
  const { admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return { error: "Not authorized." };
  const service = createAdminClient();
  if (!service) return { error: "Admin tools aren't configured." };
  const { data, error } = await service
    .from("reviews")
    .update(hidden ? { hidden_at: new Date().toISOString(), hidden_reason: reason.trim().slice(0, 500) || null } : { hidden_at: null, hidden_reason: null })
    .eq("id", reviewId)
    .select("provider_id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Review not found." };
  revalidatePath(`/vendor/${data.provider_id}`);
  revalidatePath("/admin/reviews");
  return { success: true };
}
