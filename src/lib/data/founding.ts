import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/user";
import { profileChecklist, type ChecklistItem } from "@/lib/profile-completeness";

export type FoundingPlaces = { capacity: number; approved: number; remaining: number };

/** Real counts from the database; null if the beta tables aren't deployed yet. */
export const getFoundingPlaces = cache(async function getFoundingPlaces(): Promise<FoundingPlaces | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("founding_vendor_places");
  if (error || !data?.[0]) {
    if (error) console.warn("[founding] places unavailable:", error.message);
    return null;
  }
  const row = data[0];
  return { capacity: Number(row.capacity), approved: Number(row.approved), remaining: Number(row.remaining) };
});

export type FoundingApplicationStatus = "started" | "submitted" | "approved" | "needs_changes" | "rejected" | "withdrawn";

export type MyFoundingStatus = {
  application: {
    id: string;
    status: FoundingApplicationStatus;
    source: string;
    admin_note: string | null;
    submitted_at: string | null;
    decided_at: string | null;
  } | null;
  listing: { id: string; name: string; status: string | null } | null;
  checklist: ChecklistItem[];
};

/** The signed-in user's application, listing and listing checklist. Null when signed out. */
export const getMyFoundingStatus = cache(async function getMyFoundingStatus(): Promise<MyFoundingStatus | null> {
  const session = await getCurrentUser();
  if (!session) return null;
  const supabase = await createClient();

  const [{ data: application }, { data: listing }] = await Promise.all([
    supabase
      .from("beta_applications")
      .select("id, status, source, admin_note, submitted_at, decided_at, provider_id")
      .eq("user_id", session.user.id)
      .maybeSingle(),
    supabase
      .rpc("my_service_providers")
      .select("id, name, status, bio, abn, locations_serviced, event_types, created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  let checklist: ChecklistItem[] = [];
  if (listing) {
    const [{ count: photoCount }, { count: packageCount }] = await Promise.all([
      supabase.from("portfolio_items").select("id", { count: "exact", head: true }).eq("provider_id", listing.id),
      supabase.from("vendor_packages").select("id", { count: "exact", head: true }).eq("provider_id", listing.id).eq("active", true),
    ]);
    checklist = profileChecklist({ ...listing, photoCount: photoCount ?? 0, packageCount: packageCount ?? 0 });
  }

  return {
    application: application
      ? { ...application, status: application.status as FoundingApplicationStatus }
      : null,
    listing: listing ? { id: listing.id, name: listing.name, status: listing.status } : null,
    checklist,
  };
});
