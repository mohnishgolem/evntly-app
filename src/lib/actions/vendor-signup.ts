"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type VendorSignupDraft = {
  businessName: string;
  bio: string;
  serviceType: string;
  hourlyRate: number;
  city: string;
  locationsServiced: string[];
  eventTypes: string[];
  phone?: string;
};

export type VendorSignupState = { error?: string } | null;

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

  const { error } = await supabase.from("service_providers").insert({
    owner_email: user.email,
    name: draft.businessName,
    bio: draft.bio || null,
    service_type: draft.serviceType,
    hourly_rate: draft.hourlyRate,
    city: draft.city || null,
    // "which locations do you service" — the specific ask from the call
    locations_serviced: draft.locationsServiced,
    event_types: draft.eventTypes,
    phone: draft.phone || null,
    status: "pending_review",
    available: true,
  });

  if (error) return { error: error.message };

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

  const { error } = await supabase
    .from("service_providers")
    .update({
      name: draft.businessName,
      bio: draft.bio || null,
      service_type: draft.serviceType,
      hourly_rate: draft.hourlyRate,
      city: draft.city || null,
      locations_serviced: draft.locationsServiced,
      event_types: draft.eventTypes,
      phone: draft.phone || null,
    })
    .eq("id", listingId)
    .eq("owner_email", user.email);

  if (error) return { error: error.message };

  redirect("/vendor-dashboard");
}
