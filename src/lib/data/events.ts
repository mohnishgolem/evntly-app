import { createClient } from "@/lib/supabase/server";
import { geocodeSuburb } from "@/lib/geocode";

/**
 * Events saved before locations were geocoded have no coordinates. Look the
 * suburb up once and store it (RLS: only the organiser's update lands), so
 * the board can match vendors by service area. Best-effort — null on failure.
 */
export async function locateEvent(eventId: string, suburb: string) {
  const place = await geocodeSuburb(suburb).catch(() => null);
  if (!place) return null;
  const supabase = await createClient();
  await supabase.from("events").update({ latitude: place.latitude, longitude: place.longitude }).eq("id", eventId);
  return { latitude: place.latitude, longitude: place.longitude };
}
