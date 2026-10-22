"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PricingActionState = { error?: string; success?: boolean } | null;

// RLS (service_providers_update_own, vendor_packages_owner_write) already
// limits writes to the caller's own listings; the ownership check turns a
// silent no-op into a clear error. All money arrives in dollars from the
// form and is stored in integer cents.

async function ownListing(listingId: unknown) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || typeof listingId !== "string" || !listingId) return { supabase, listing: null };
  const { data: listing } = await supabase.rpc("my_service_providers").select("id").eq("id", listingId).maybeSingle();
  return { supabase, listing };
}

function revalidate(listingId: string) {
  revalidatePath("/vendor-dashboard/pricing");
  revalidatePath(`/vendor/${listingId}`);
}

const cents = (dollars: number) => Math.round(dollars * 100);

// ── Service area ────────────────────────────────────────────────────────

const areaSchema = z.object({
  radiusKm: z.number().int().min(1).max(1000),
  freeTravelKm: z.number().int().min(0).max(1000),
  travelFeePerKm: z.number().min(0).max(20),
  travelsRegional: z.boolean(),
  minBookingHours: z.number().min(0).max(24).nullable(),
});

export type ServiceAreaInput = z.input<typeof areaSchema>;

export async function updateServiceArea(listingId: string, input: ServiceAreaInput): Promise<PricingActionState> {
  const parsed = areaSchema.safeParse(input);
  if (!parsed.success) return { error: "Check your service area and travel settings." };
  const d = parsed.data;
  if (d.freeTravelKm > d.radiusKm) return { error: "Free travel can't reach further than your service radius." };

  const { supabase, listing } = await ownListing(listingId);
  if (!listing) return { error: "Listing not found." };

  const { error } = await supabase
    .from("service_providers")
    .update({
      service_radius_km: d.radiusKm,
      free_travel_km: d.freeTravelKm,
      travel_fee_cents_per_km: cents(d.travelFeePerKm),
      travels_regional: d.travelsRegional,
      min_booking_hours: d.minBookingHours ? Math.round(d.minBookingHours * 2) / 2 : null,
    })
    .eq("id", listingId);
  if (error) return { error: "Couldn't save your service area." };
  revalidate(listingId);
  return { success: true };
}

// ── Packages ────────────────────────────────────────────────────────────

const packageSchema = z.object({
  name: z.string().trim().min(1, "Give the package a name.").max(80),
  description: z.string().trim().max(1000),
  price: z.number().min(1, "Enter a price.").max(100_000),
  includedHours: z.number().min(0.5).max(72).nullable(),
  extraHourPrice: z.number().min(1).max(10_000).nullable(),
  inclusions: z.array(z.string().trim().min(1).max(120)).max(20),
  deliveryDays: z.number().int().min(0).max(365).nullable(),
  depositPercent: z.number().int().min(0).max(100).nullable(),
  active: z.boolean(),
});

export type PackageInput = z.input<typeof packageSchema>;

export async function savePackage(listingId: string, input: PackageInput, packageId?: string): Promise<PricingActionState> {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the package details." };
  const d = parsed.data;
  if (d.extraHourPrice != null && d.includedHours == null) {
    return { error: "Extra hours only apply to packages with set hours." };
  }

  const { supabase, listing } = await ownListing(listingId);
  if (!listing) return { error: "Listing not found." };

  const row = {
    name: d.name,
    description: d.description || null,
    price_cents: cents(d.price),
    included_hours: d.includedHours,
    extra_hour_cents: d.extraHourPrice == null ? null : cents(d.extraHourPrice),
    inclusions: d.inclusions,
    delivery_days: d.deliveryDays,
    deposit_percent: d.depositPercent,
    active: d.active,
  };

  const { error } = packageId
    ? await supabase.from("vendor_packages").update(row).eq("id", packageId).eq("provider_id", listingId)
    : await supabase.from("vendor_packages").insert({ ...row, provider_id: listingId });
  if (error) return { error: /up to 12/.test(error.message) ? "A listing can have up to 12 packages." : "Couldn't save this package." };
  revalidate(listingId);
  return { success: true };
}

export async function deletePackage(listingId: string, packageId: string): Promise<PricingActionState> {
  const { supabase, listing } = await ownListing(listingId);
  if (!listing || typeof packageId !== "string") return { error: "Listing not found." };
  const { error } = await supabase.from("vendor_packages").delete().eq("id", packageId).eq("provider_id", listingId);
  if (error) return { error: "Couldn't delete this package." };
  revalidate(listingId);
  return { success: true };
}

// ── Calendar ────────────────────────────────────────────────────────────

/** "My calendar is up to date": the DB stamps now(), whatever is sent. */
export async function confirmCalendarCurrent(listingId: string): Promise<PricingActionState> {
  const { supabase, listing } = await ownListing(listingId);
  if (!listing) return { error: "Listing not found." };
  const { error } = await supabase
    .from("service_providers")
    .update({ availability_confirmed_at: new Date().toISOString() })
    .eq("id", listingId);
  if (error) return { error: "Couldn't update your calendar status." };
  revalidatePath("/vendor-dashboard/calendar");
  return { success: true };
}
