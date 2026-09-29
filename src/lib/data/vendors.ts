import { createClient } from "@/lib/supabase/server";
import { LAUNCH_CATEGORIES, LAUNCH_CITY } from "@/lib/config";

export async function getFeaturedVendors(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_providers")
    .select("*")
    .eq("status", "approved")
    .in("service_type", LAUNCH_CATEGORIES)
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(limit);

  return data ?? [];
}

export type VendorFilters = {
  q?: string;
  category?: string;
  eventType?: string;
};

export async function searchVendors(filters: VendorFilters = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("service_providers")
    .select("*")
    .eq("status", "approved");

  if (filters.category) {
    query = query.eq("service_type", filters.category);
  }
  if (filters.eventType) {
    query = query.contains("event_types", [filters.eventType]);
  }
  if (filters.q) {
    query = query.or(
      `name.ilike.%${filters.q}%,description.ilike.%${filters.q}%,city.ilike.%${filters.q}%`
    );
  }

  const { data } = await query.order("rating", { ascending: false, nullsFirst: false });
  return data ?? [];
}

export async function getVendorById(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return data;
}

export async function getVendorPortfolio(providerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("portfolio_items")
    .select("*")
    .eq("provider_id", providerId)
    .order("sort_order", { ascending: true, nullsFirst: false });

  return data ?? [];
}

export async function getVendorReviews(providerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("*")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export const launchCity = LAUNCH_CITY;
