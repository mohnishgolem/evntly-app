"use server";

import { EVENT_DATE_ERROR, isBookableEventDate } from "@/lib/event-dates";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyLegalError } from "@/lib/legal/status";

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
    .rpc("my_service_providers")
    .select("id, name")
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
    .select("combined_package_id")
    .eq("id", participantId)
    .eq("vendor_user_id", user.id)
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

// Customer books an active bundle — the book_bundle RPC creates the order, a
// per-vendor payout line for each participant, and the group chat thread in
// one transaction, without the customer reading the vendors' emails.
export async function bookBundle(packageId: string, draft: BookBundleDraft): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not logged in." };
  if (!isBookableEventDate(draft.eventDate)) return { error: EVENT_DATE_ERROR };

  const { error } = await supabase.rpc("book_bundle", {
    p_package_id: packageId,
    p_event_date: draft.eventDate,
    p_event_time: draft.eventTime ?? "",
    p_event_address: draft.eventAddress,
    p_notes: draft.notes ?? "",
  });
  if (error) return { error: friendlyLegalError(error.message) };

  revalidatePath("/dashboard/bundles");
  redirect("/dashboard/bundles");
}
