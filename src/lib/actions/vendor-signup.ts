"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/email";
import { geocodeSuburb, isInAustralia } from "@/lib/geocode";
import { isValidAbn, normalizeAbn } from "@/lib/abn";
import { isLaunchCategory, isVendorCategory } from "@/lib/config";
import { VENDOR_DOCUMENTS } from "@/lib/legal/versions";
import { friendlyLegalError } from "@/lib/legal/status";
import { emailApplicationReceived } from "@/lib/founding/notify";
import { CLAIM_PATH } from "@/lib/founding/sources";

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
  // Required for new listings (Vendor Service Agreement s3); shown on
  // booking invoices.
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
  draft: VendorSignupDraft,
  // The wizard's required "I agree to the Vendor Service Agreement" box.
  agreement: { acceptedVendorAgreement: boolean } = { acceptedVendorAgreement: false }
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

  // Vendor Service Agreement s3: a valid ABN is required to list.
  const abn = normalizeAbn(draft.abn);
  if (!abn || !isValidAbn(abn)) {
    return { error: "Enter a valid 11-digit ABN. You can check it at abr.business.gov.au." };
  }
  if (agreement.acceptedVendorAgreement !== true) {
    return { error: "Please agree to the Vendor Service Agreement to submit your listing." };
  }

  const { data: existing } = await supabase
    .rpc("my_service_providers")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    redirect("/vendor-dashboard");
  }

  // Recorded (server timestamp, append-only) before the listing exists; the
  // database refuses new listings without it.
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
    hourly_rate: draft.hourlyRate,
    city: draft.city || null,
    ...coordinates,
    // "which locations do you service" — the specific ask from the call
    locations_serviced: draft.locationsServiced,
    event_types: draft.eventTypes,
    phone: draft.phone || null,
    abn,
    gst_registered: !!draft.gstRegistered,
    status: "pending_review",
    available: true,
  });

  if (error) return { error: friendlyLegalError(error.message) };

  // Keep nav routing in sync: a customer account that creates a listing
  // (not just one that signed up as "I'm a vendor") still needs isVendor
  // checks in the header to send them to /vendor-dashboard.
  await supabase.from("users").update({ role: "vendor" }).eq("id", user.id);

  // Vendors who claimed a founding place first go back to their application
  // (the insert moved it to "submitted" via a DB trigger).
  const { data: beta } = await supabase
    .from("beta_applications")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (beta?.status === "submitted") {
    await emailApplicationReceived(user.email);
    redirect(CLAIM_PATH);
  }

  await emailAdminsNewListing(draft.businessName, draft.serviceType, draft.city);
  redirect("/vendor-dashboard");
}

// New vendors wait for approval before anyone can see them, so tell the
// admins straight away instead of relying on someone checking /admin.
async function emailAdminsNewListing(name: string, serviceType: string, city: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: admins } = await admin.from("users").select("email").eq("role", "admin");
  for (const { email } of admins ?? []) {
    notify({
      to: email,
      category: "enquiries",
      subject: `New vendor to approve: ${name}`,
      heading: "A new vendor is waiting for approval",
      lines: [`${name} (${serviceType}${city ? `, ${city}` : ""}) just submitted a listing.`],
      cta: { label: "Review approvals", path: "/admin/approvals" },
    });
  }
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
