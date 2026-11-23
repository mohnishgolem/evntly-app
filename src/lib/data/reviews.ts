import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDraftId } from "@/lib/profile-reviews";

// Review lookups that need the service role (reviewer ids and drafts aren't
// readable with a visitor's session). Server components only.

export type ReviewDraft = { rating: number | null; comment: string; eventType: string | null };

/** A guest's saved draft for this vendor, if it's recent and not yet posted. */
export async function loadReviewDraft(draftId: string | null | undefined, vendorId: string): Promise<ReviewDraft | null> {
  if (!isDraftId(draftId)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("review_drafts")
    .select("rating, comment, event_type, created_at, used_at")
    .eq("id", draftId)
    .eq("provider_id", vendorId)
    .maybeSingle();
  if (!data || data.used_at || Date.now() - new Date(data.created_at).getTime() > 7 * 86400000) return null;
  return { rating: data.rating, comment: data.comment ?? "", eventType: data.event_type };
}

/**
 * Whether this person has nothing left to review for the vendor: no completed
 * Evntly booking still unreviewed, and already a past-client review.
 */
export async function hasReviewedVendor(vendorId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const [{ data: reviews }, { data: bookings }] = await Promise.all([
    admin.from("reviews").select("source, booking_id").eq("provider_id", vendorId).eq("reviewer_user_id", userId),
    admin.from("bookings").select("id").eq("provider_id", vendorId).eq("client_user_id", userId).eq("status", "completed"),
  ]);
  const reviewedBookings = new Set((reviews ?? []).map((r) => r.booking_id).filter(Boolean));
  const unreviewedBooking = (bookings ?? []).some((b) => !reviewedBookings.has(b.id));
  const pastClient = (reviews ?? []).some((r) => r.source === "past_client");
  return !unreviewedBooking && pastClient;
}
