"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Replace the vendor's calendar-feed link; calendars subscribed to the old
// one stop updating (its events stay until the user removes the calendar).
export async function resetCalendarFeed(): Promise<{ error?: string } | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("my_calendar_feed_token", { p_rotate: true });
  if (error) return { error: error.message };
  revalidatePath("/vendor-dashboard/calendar");
  return null;
}
