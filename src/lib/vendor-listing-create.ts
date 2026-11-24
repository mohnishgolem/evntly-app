import "server-only";
import { createClient } from "@/lib/supabase/server";
import { geocodeSuburb, isInAustralia } from "@/lib/geocode";
import { isValidAbn, normalizeAbn } from "@/lib/abn";
import { isLaunchCategory } from "@/lib/config";
import { VENDOR_DOCUMENTS } from "@/lib/legal/versions";
import { friendlyLegalError } from "@/lib/legal/status";
import { pricingColumns, type PricingDraft } from "@/lib/pricing-model";

// Creating a vendor's listing, shared by the listing form (/vendor-signup)
// and saving a private draft (/become-a-vendor/save). Every check the form
// always had stays here, in one place:
//   * signed in;
//   * a launch category;
//   * a valid ABN (Vendor Service Agreement s3);
//   * the Vendor Service Agreement accepted, recorded before the listing
//     exists (the database refuses new listings without it);
//   * one listing per account;
//   * saved as a DRAFT: it goes to review only from the finish page once it
//     has photos and a package, and is public only after an admin approves.
//
// Not a server action module on purpose: callers are server actions that
// have already decided the input is the caller's own.

export type NewListing = PricingDraft & {
  businessName: string;
  bio: string;
  serviceType: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  locationsServiced: string[];
  eventTypes: string[];
  phone?: string;
  abn?: string;
  gstRegistered?: boolean;
  socialLink?: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

// providerId is null only if the new row couldn't be read back; the listing
// was still created, so callers carry on (it shows on the dashboard).
export type CreateListingResult = { error: string } | { existing: true } | { providerId: string | null };

async function resolveCoordinates(d: NewListing) {
  const { latitude, longitude } = d;
  if (latitude != null && longitude != null && isInAustralia(latitude, longitude)) return { latitude, longitude };
  const place = d.city ? await geocodeSuburb(d.city) : null;
  return { latitude: place?.latitude ?? null, longitude: place?.longitude ?? null };
}

export async function createVendorListing(
  supabase: Supabase,
  user: { id: string; email?: string | null },
  draft: NewListing,
  agreement: { acceptedVendorAgreement: boolean }
): Promise<CreateListingResult> {
  if (!user.email) return { error: "You need to be logged in to list a business." };
  if (!isLaunchCategory(draft.serviceType)) return { error: "Pick one of the listed categories." };
  const abn = normalizeAbn(draft.abn);
  if (!abn || !isValidAbn(abn)) return { error: "Enter a valid 11-digit ABN. You can check it at abr.business.gov.au." };
  if (agreement.acceptedVendorAgreement !== true) {
    return { error: "Please agree to the Vendor Service Agreement to submit your listing." };
  }
  const pricing = pricingColumns(draft);
  if ("error" in pricing) return { error: pricing.error };

  const { data: existing } = await supabase.rpc("my_service_providers").select("id").limit(1).maybeSingle();
  if (existing) return { existing: true };

  const { error: legalError } = await supabase.rpc("record_legal_acceptance", {
    p_documents: [...VENDOR_DOCUMENTS],
    p_context: "vendor_onboarding",
  });
  if (legalError) return { error: "We couldn't record your agreement. Please try again." };

  const coordinates = await resolveCoordinates(draft);
  const { error } = await supabase.from("service_providers").insert({
    owner_email: user.email,
    name: draft.businessName,
    bio: draft.bio || null,
    service_type: draft.serviceType,
    ...pricing,
    city: draft.city || null,
    ...coordinates,
    locations_serviced: draft.locationsServiced,
    event_types: draft.eventTypes,
    phone: draft.phone || null,
    abn,
    gst_registered: !!draft.gstRegistered,
    ...(draft.socialLink ? { social_link: draft.socialLink } : {}),
    // Forced to "draft" by the database for vendors; set here to match.
    status: "draft",
    available: true,
  });
  if (error) return { error: friendlyLegalError(error.message) };

  // Keep nav routing in sync (a customer account that lists a business).
  await supabase.from("users").update({ role: "vendor" }).eq("id", user.id);

  try {
    const { data: created } = await supabase.rpc("my_service_providers").select("id").limit(1).maybeSingle();
    return { providerId: (created?.id as string | undefined) ?? null };
  } catch {
    return { providerId: null };
  }
}
