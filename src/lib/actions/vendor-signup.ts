"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { geocodeSuburb, isInAustralia } from "@/lib/geocode";
import { isValidAbn, normalizeAbn } from "@/lib/abn";
import { isLaunchCategory, isVendorCategory } from "@/lib/config";

export type VendorSignupDraft = {
  businessName: string;
  bio: string;
  serviceType: string;
  hourlyRate: number;
  city: string;
  // Set when the vendor picks a suggestion from the suburb picker; otherwise
  // the server geocodes `city` itself.
  latitude?: number | null;
  longitude?: number | null;
  locationsServiced: string[];
  eventTypes: string[];
  phone?: string;
  // Edit form only (optional at signup): shown on booking invoices.
  abn?: string;
  gstRegistered?: boolean;
};

export type VendorSignupState = { error?: string } | null;

// Coordinates for the public map pin. Precision is coarsened to ~1 km by the
// `coarsen_vendor_coordinates` DB trigger, whichever path supplied them.
async function resolveCoordinates(draft: VendorSignupDraft) {
  const { latitude, longitude } = draft;
  if (latitude != null && longitude != null && isInAustralia(latitude, longitude)) {
    return { latitude, longitude };
  }
  const place = draft.city ? await geocodeSuburb(draft.city) : null;
  return {
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
  };
}

export async function submitVendorListing(
  draft: VendorSignupDraft
): Promise<VendorSignupState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "You need to be logged in to list a business." };
  }

  // New listings can only join a category that's live in the launch market.
  if (!isLaunchCategory(draft.serviceType)) {
    return { error: "Pick one of the listed categories." };
  }

  const { data: existing } = await supabase
    .rpc("my_service_providers")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    redirect("/vendor-dashboard");
  }

  const coordinates = await resolveCoordinates(draft);
  const { error } = await supabase.from("service_providers").insert({
    owner_email: user.email,
    name: draft.businessName,
    bio: draft.bio || null,
    service_type: draft.serviceType,
    hourly_rate: draft.hourlyRate,
    city: draft.city || null,
    ...coordinates,
    // "which locations do you service" — the specific ask from the call
    locations_serviced: draft.locationsServiced,
    event_types: draft.eventTypes,
    phone: draft.phone || null,
    status: "pending_review",
    available: true,
  });

  if (error) return { error: error.message };

  // Keep nav routing in sync: a customer account that creates a listing
  // (not just one that signed up as "I'm a vendor") still needs isVendor
  // checks in the header to send them to /vendor-dashboard.
  await supabase.from("users").update({ role: "vendor" }).eq("id", user.id);

  redirect("/vendor-dashboard");
}

export async function updateVendorListing(
  listingId: string,
  draft: VendorSignupDraft
): Promise<VendorSignupState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "You need to be logged in to edit a listing." };
  }

  // Existing listings may keep a category that has since left the launch
  // list (the edit form still shows it), but nothing outside the known set.
  if (!isVendorCategory(draft.serviceType)) {
    return { error: "Pick one of the listed categories." };
  }

  const abn = normalizeAbn(draft.abn);
  if (abn && !isValidAbn(abn)) {
    return { error: "That ABN isn't valid. Check the 11 digits on abr.business.gov.au." };
  }

  const coordinates = await resolveCoordinates(draft);
  const { error } = await supabase
    .from("service_providers")
    .update({
      name: draft.businessName,
      bio: draft.bio || null,
      service_type: draft.serviceType,
      hourly_rate: draft.hourlyRate,
      city: draft.city || null,
      ...coordinates,
      locations_serviced: draft.locationsServiced,
      event_types: draft.eventTypes,
      phone: draft.phone || null,
      abn,
      // GST registration needs an ABN.
      gst_registered: !!abn && !!draft.gstRegistered,
    })
    // RLS (service_providers_update_own) limits this to the caller's own row.
    .eq("id", listingId);

  if (error) return { error: error.message };

  redirect("/vendor-dashboard/business");
}
