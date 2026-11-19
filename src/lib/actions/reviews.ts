"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp, RATE_LIMIT_ERROR } from "@/lib/rate-limit";
import { EVENT_TYPES } from "@/lib/config";
import { notify, sendEmail } from "@/lib/email";
import { getAdminSession } from "@/lib/data/user";
import { isShareSource, SHARE_SOURCE_COOKIE, type ShareSource } from "@/lib/share-profile";
import { friendlyReviewError, isDraftId, REVIEW_COMMENT_MAX, REVIEW_COMMENT_MIN, reviewerDisplayName } from "@/lib/profile-reviews";

export type ActionState = { error?: string; success?: boolean } | null;

// One review flow, started from the vendor's public profile, for anyone who
// hired the vendor. See lib/profile-reviews.ts.

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(REVIEW_COMMENT_MIN).max(REVIEW_COMMENT_MAX),
  eventType: z.enum(EVENT_TYPES).nullable(),
  confirmed: z.literal(true),
});
export type ReviewInput = z.input<typeof reviewSchema>;

const draftSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
  comment: z.string().max(REVIEW_COMMENT_MAX),
  eventType: z.enum(EVENT_TYPES).nullable(),
});
export type ReviewDraftInput = z.input<typeof draftSchema>;

/** The Share profile channel this vendor page was reached from (cookie on /vendor/<id>). */
async function shareSourceFromCookie(): Promise<ShareSource | null> {
  try {
    const value = (await cookies()).get(SHARE_SOURCE_COOKIE)?.value;
    return isShareSource(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * A guest's review before they have an account: saved server-side so it's
 * waiting after sign-up and email verification, even if the email link opens
 * in another browser. Returns the draft id that goes in the return path.
 */
export async function saveReviewDraft(providerId: string, input: ReviewDraftInput): Promise<{ draftId?: string; error?: string }> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success || !/^[0-9a-f-]{36}$/.test(providerId)) return { error: "Check your review and try again." };
  if (!(await checkRateLimit("reviewDraftIp", await clientIp()))) return { error: RATE_LIMIT_ERROR };
  const admin = createAdminClient();
  if (!admin) return { error: "Reviews aren't available right now." };
  const { data: vendor } = await admin.from("service_providers").select("status, is_demo").eq("id", providerId).maybeSingle();
  if (!vendor || vendor.status !== "approved" || vendor.is_demo) return { error: friendlyReviewError("can't receive reviews") };
  // Drafts are only needed for the sign-up round trip; old ones go.
  await admin.from("review_drafts").delete().lt("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
  const { data, error } = await admin
    .from("review_drafts")
    .insert({
      provider_id: providerId,
      rating: parsed.data.rating,
      comment: parsed.data.comment.trim() || null,
      event_type: parsed.data.eventType,
      share_source: await shareSourceFromCookie(),
    })
    .select("id")
    .single();
  if (error || !data) return { error: "We couldn't save your review. Please try again." };
  return { draftId: data.id };
}

/**
 * Post a review from the vendor's profile. A completed Evntly booking with
 * this vendor that hasn't been reviewed makes it a booking review; otherwise
 * it's a past-client review. The database checks the rules again.
 */
export async function submitReview(providerId: string, input: ReviewInput, draftId?: string | null): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Create a free account or log in to post your review." };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "confirmed") return { error: "Please confirm you hired this vendor yourself." };
    if (field === "comment") return { error: friendlyReviewError("20 to 2,000") };
    return { error: "Choose a rating from 1 to 5." };
  }
  if (!(await checkRateLimit("reviewUser", user.id))) return { error: RATE_LIMIT_ERROR };

  const { data: vendor } = await supabase.from("service_providers").select("id, name, status, is_demo").eq("id", providerId).maybeSingle();
  if (!vendor || vendor.status !== "approved" || vendor.is_demo) return { error: friendlyReviewError("can't receive reviews") };
  const { data: own } = await supabase.rpc("my_service_providers").select("id").eq("id", providerId).maybeSingle();
  if (own) return { error: friendlyReviewError("your own business") };

  const admin = createAdminClient();
  // Which completed Evntly booking (if any) this review is for. Reviewer ids
  // aren't readable with the customer's session, so check with the service role.
  let bookingId: string | null = null;
  const { data: completed } = await supabase
    .from("bookings")
    .select("id")
    .eq("provider_id", providerId)
    .eq("client_user_id", user.id)
    .eq("status", "completed");
  if (completed?.length) {
    const { data: reviewed } = admin
      ? await admin.from("reviews").select("booking_id").eq("reviewer_user_id", user.id).in("booking_id", completed.map((b) => b.id))
      : { data: [] };
    const done = new Set((reviewed ?? []).map((r) => r.booking_id));
    bookingId = completed.find((b) => !done.has(b.id))?.id ?? null;
  }

  // The share channel: this vendor page's cookie, else the draft's (when the
  // guest finished sign-up in another browser).
  let draftShare: ShareSource | null = null;
  if (draftId && isDraftId(draftId) && admin) {
    const { data: d } = await admin.from("review_drafts").select("share_source").eq("id", draftId).eq("provider_id", providerId).maybeSingle();
    if (d && isShareSource(d.share_source)) draftShare = d.share_source;
  }
  const shareSource = (await shareSourceFromCookie()) ?? draftShare;

  const { rating, comment, eventType } = parsed.data;
  const { error } = await supabase.from("reviews").insert({
    provider_id: providerId,
    booking_id: bookingId,
    reviewer_email: user.email,
    reviewer_user_id: user.id,
    reviewer_name: reviewerDisplayName(user.user_metadata?.full_name as string | undefined),
    rating,
    comment,
    event_type: eventType,
    source: bookingId ? "booking" : "past_client",
    ...(shareSource ? { share_source: shareSource } : {}),
  });
  if (error) return { error: friendlyReviewError(error.message) };

  if (draftId && isDraftId(draftId) && admin) {
    await admin.from("review_drafts").update({ used_at: new Date().toISOString() }).eq("id", draftId).eq("provider_id", providerId);
  }
  await notifyNewReview(providerId, vendor.name, rating, comment, !bookingId);
  revalidatePath(`/vendor/${providerId}`);
  revalidatePath("/dashboard/bookings");
  return { success: true };
}

// The vendor hears about their new review; admins get a copy of past-client
// reviews so they can hide one that looks fake. Emails are only readable with
// the service role.
async function notifyNewReview(providerId: string, vendorName: string, rating: number, comment: string, pastClient: boolean) {
  const admin = createAdminClient();
  if (!admin) return;
  const [{ data: v }, { data: admins }] = await Promise.all([
    admin.from("service_providers").select("owner_email").eq("id", providerId).maybeSingle(),
    pastClient ? admin.from("users").select("email").eq("role", "admin") : Promise.resolve({ data: [] as { email: string | null }[] }),
  ]);
  const stars = `${rating} star${rating === 1 ? "" : "s"}`;
  notify({
    to: v?.owner_email,
    category: "bookings",
    subject: `New review for ${vendorName.trim()}: ${stars}`,
    heading: pastClient ? "A past client reviewed you" : "A customer reviewed their booking",
    lines: [`You have a new ${stars} review on Evntly. It's on your profile now.`],
    quote: comment,
    cta: { label: "See your profile", path: `/vendor/${providerId}` },
  });
  for (const a of admins ?? []) {
    if (!a.email) continue;
    void sendEmail({
      to: a.email,
      subject: `Past-client review: ${vendorName.trim()} (${stars})`,
      heading: "New past-client review",
      lines: [`${vendorName.trim()} received a ${stars} review from a past client. It's live now. Hide it in Admin if it looks fake.`],
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
