"use server";

import { searchPlaces, type Place } from "@/lib/geocode";

// Suburb autocomplete for the vendor listing forms. Proxied through the server
// so Photon sees one well-identified client and identical lookups are cached.
export async function suggestSuburbs(query: string): Promise<Place[]> {
  return searchPlaces(query.slice(0, 80));
}
