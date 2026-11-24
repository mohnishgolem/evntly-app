import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planningProgress } from "@/lib/event-board";
import { sydneyDate } from "@/lib/event-dates";
import { PUBLIC_VENDOR_COLUMNS, type PublicVendor } from "@/lib/vendor-columns";
import { sampleListingsHidden } from "@/lib/sample-listings";

// Vendor profiles this customer opened recently, newest first. Page views
// are service-role only, so this reads them server-side for this user only.
export async function recentlyViewedVendors(userId: string, limit = 4): Promise<PublicVendor[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data: views } = await admin
    .from("page_views")
    .select("vendor_id, created_at")
    .eq("user_id", userId)
    .eq("kind", "vendor")
    .not("vendor_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);
  const ids = [...new Set((views ?? []).map((v) => v.vendor_id as string))].slice(0, limit);
  if (ids.length === 0) return [];

  const supabase = await createClient();
  let query = supabase.from("service_providers").select(PUBLIC_VENDOR_COLUMNS).eq("status", "approved").in("id", ids);
  if (sampleListingsHidden()) query = query.eq("is_demo", false);
  const { data } = await query;
  const byId = new Map((data ?? []).map((v) => [v.id, v as PublicVendor]));
  return ids.map((id) => byId.get(id)).filter((v): v is PublicVendor => !!v);
}

export type PlanningCard = {
  id: string;
  name: string;
  date: string;
  suburb: string | null;
  done: number;
  total: number;
  percent: number;
  /** First service still to book, if any. */
  openService: string | null;
};

// The customer's upcoming events with how far along booking is — for the
// homepage's "Continue planning" cards. Soonest first.
export async function continuePlanning(userId: string, limit = 3): Promise<PlanningCard[]> {
  const supabase = await createClient();
  const [{ data: events }, { data: bookings }] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, event_type, event_date, suburb, required_services")
      .eq("organiser_user_id", userId)
      .gte("event_date", sydneyDate())
      .order("event_date", { ascending: true })
      .order("id")
      .limit(limit),
    supabase.from("bookings").select("event_id, service_type, status").eq("client_user_id", userId).not("event_id", "is", null),
  ]);

  return (events ?? []).map((e) => {
    const mine = (bookings ?? []).filter((b) => b.event_id === e.id);
    const progress = planningProgress(e.required_services, mine);
    const confirmed = new Set(mine.filter((b) => b.status === "confirmed" || b.status === "completed").map((b) => b.service_type));
    return {
      id: e.id,
      name: e.name || e.event_type || "Your event",
      date: e.event_date,
      suburb: e.suburb,
      ...progress,
      openService: e.required_services.find((s) => !confirmed.has(s)) ?? null,
    };
  });
}
