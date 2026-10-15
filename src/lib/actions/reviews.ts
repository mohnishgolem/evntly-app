"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMIT_ERROR } from "@/lib/rate-limit";

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
