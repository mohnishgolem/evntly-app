"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
