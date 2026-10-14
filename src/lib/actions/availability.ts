"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AvailabilityState = { error?: string; success?: boolean } | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The calendar sends whole arrays (it holds the optimistic state), so these
// are plain overwrites. RLS (service_providers_update_own) limits writes to
// the caller's own listings. The fill_quote_request_vendor trigger refuses
// quote requests on blocked dates / days off / while paused.
async function updateListing(
  listingId: string,
  patch: {
    unavailable_dates?: string[];
    weekly_unavailable_days?: number[];
    available?: boolean;
  }
): Promise<AvailabilityState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data, error } = await supabase
    .from("service_providers")
    .update(patch)
    .eq("id", listingId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Listing not found." };

  revalidatePath("/vendor-dashboard/calendar");
  revalidatePath(`/vendor/${listingId}`);
  return { success: true };
}

export async function setBlockedDates(listingId: string, dates: string[]) {
  const clean = [...new Set(dates.filter((d) => DATE_RE.test(d)))].sort();
  return updateListing(listingId, { unavailable_dates: clean });
}

export async function setWeeklyDaysOff(listingId: string, days: number[]) {
  const clean = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return updateListing(listingId, { weekly_unavailable_days: clean });
}

export async function setAcceptingBookings(listingId: string, accepting: boolean) {
  return updateListing(listingId, { available: accepting });
}
