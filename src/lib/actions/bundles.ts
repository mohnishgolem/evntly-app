"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | null;

export type PackageParticipantDraft = {
  vendorEmail: string;
  vendorName: string;
  componentPrice: number;
};

export type CreatePackageDraft = {
  name: string;
  description: string;
  category: string;
  bundleDiscountAmount: number;
  myComponentPrice: number;
  participants: PackageParticipantDraft[];
};

// A vendor proposes a multi-vendor bundle. It stays `pending` until every
// invited vendor accepts, at which point it flips to `active` and becomes
// bookable by customers.
export async function createCombinedPackage(draft: CreatePackageDraft): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { data: listing } = await supabase
    .from("service_providers")
    .select("id, name")
    .eq("owner_email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!listing) return { error: "Set up your vendor listing before creating a bundle." };

  const allParticipants = [
    { vendorEmail: user.email, vendorName: listing.name, componentPrice: draft.myComponentPrice },
    ...draft.participants,
  ];
  const totalPrice = allParticipants.reduce((sum, p) => sum + p.componentPrice, 0);

  const { data: pkg, error } = await supabase
    .from("combined_packages")
    .insert({
      name: draft.name,
      description: draft.description || null,
      category: draft.category || null,
      initiating_vendor_id: listing.id,
      initiating_vendor_email: user.email,
      initiating_vendor_name: listing.name,
      total_price: totalPrice,
      bundle_discount_amount: draft.bundleDiscountAmount,
      participant_emails: allParticipants.map((p) => p.vendorEmail),
      status: draft.participants.length === 0 ? "active" : "pending",
    })
    .select("id")
    .single();

  if (error || !pkg) return { error: error?.message ?? "Could not create bundle." };

  const { error: participantsError } = await supabase.from("combined_package_participants").insert(
    allParticipants.map((p) => ({
      combined_package_id: pkg.id,
      combined_package_name: draft.name,
      initiating_vendor_email: user.email,
      vendor_email: p.vendorEmail,
      vendor_name: p.vendorName,
      component_price: p.componentPrice,
      proposed_by_email: user.email,
      is_initiator: p.vendorEmail === user.email,
      acceptance_status: p.vendorEmail === user.email ? "accepted" : "pending",
    }))
  );

  if (participantsError) return { error: participantsError.message };

  revalidatePath("/vendor-dashboard/bundles");
  redirect("/vendor-dashboard/bundles");
}

export async function respondToPackageInvite(
  participantId: string,
  action: "accept" | "decline"
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const { data: participant, error: fetchError } = await supabase
    .from("combined_package_participants")
    .select("*")
    .eq("id", participantId)
    .eq("vendor_email", user.email)
    .single();

  if (fetchError || !participant) return { error: "Invite not found." };

  const { error } = await supabase
    .from("combined_package_participants")
    .update({ acceptance_status: action === "accept" ? "accepted" : "declined" })
    .eq("id", participantId);
  if (error) return { error: error.message };

  if (action === "decline") {
    await supabase
      .from("combined_packages")
      .update({ status: "cancelled" })
      .eq("id", participant.combined_package_id);
  } else {
    const { data: allParticipants } = await supabase
      .from("combined_package_participants")
      .select("acceptance_status")
      .eq("combined_package_id", participant.combined_package_id);

    const allAccepted = (allParticipants ?? []).every((p) => p.acceptance_status === "accepted");
    if (allAccepted) {
      await supabase
        .from("combined_packages")
        .update({ status: "active" })
        .eq("id", participant.combined_package_id);
    }
  }

  revalidatePath("/vendor-dashboard/bundles");
  return { success: true };
}

export type BookBundleDraft = {
  eventDate: string;
  eventTime?: string;
  eventAddress: string;
  notes?: string;
};

// Customer books an active bundle — creates the order, a per-vendor payout
// line for each participant, and the group chat thread for coordination.
export async function bookBundle(packageId: string, draft: BookBundleDraft): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };

  const [{ data: pkg }, { data: participants }] = await Promise.all([
    supabase.from("combined_packages").select("*").eq("id", packageId).single(),
    supabase
      .from("combined_package_participants")
      .select("*")
      .eq("combined_package_id", packageId),
  ]);

  if (!pkg || pkg.status !== "active") return { error: "This bundle isn't available to book." };
  if (!participants || participants.length === 0) return { error: "This bundle has no vendors." };

  const totalPrice = pkg.total_price ?? 0;
  const discount = pkg.bundle_discount_amount ?? 0;
  const totalAmount = Math.max(totalPrice - discount, 0);

  const { data: bundleBooking, error: bookingError } = await supabase
    .from("bundle_bookings")
    .insert({
      combined_package_id: packageId,
      combined_package_name: pkg.name,
      customer_email: user.email,
      customer_name: user.user_metadata?.full_name ?? null,
      event_date: draft.eventDate,
      event_time: draft.eventTime || null,
      event_address: draft.eventAddress,
      notes: draft.notes || null,
      status: "pending",
      payment_status: "unpaid",
      total_amount: totalAmount,
      platform_fee: null,
      vendor_emails: participants.map((p) => p.vendor_email),
      vendor_count: participants.length,
    })
    .select("id")
    .single();

  if (bookingError || !bundleBooking) {
    return { error: bookingError?.message ?? "Could not create booking." };
  }

  const discountRatio = totalPrice > 0 ? discount / totalPrice : 0;
  const { error: itemsError } = await supabase.from("bundle_booking_items").insert(
    participants.map((p) => {
      const componentPrice = p.component_price ?? 0;
      const discountShare = Math.round(componentPrice * discountRatio * 100) / 100;
      return {
        bundle_booking_id: bundleBooking.id,
        customer_email: user.email,
        vendor_id: p.vendor_id,
        vendor_email: p.vendor_email,
        vendor_name: p.vendor_name,
        package_id: p.package_id,
        package_name: p.package_name,
        component_price: componentPrice,
        discount_share: discountShare,
        amount: componentPrice - discountShare,
        payout_status: "pending",
      };
    })
  );
  if (itemsError) return { error: itemsError.message };

  const allEmails = [user.email, ...participants.map((p) => p.vendor_email)];
  await supabase.from("group_chat_threads").insert({
    bundle_booking_id: bundleBooking.id,
    combined_package_id: packageId,
    combined_package_name: pkg.name,
    customer_email: user.email,
    customer_name: user.user_metadata?.full_name ?? null,
    participant_emails: allEmails,
  });

  revalidatePath("/dashboard/bundles");
  redirect("/dashboard/bundles");
}
