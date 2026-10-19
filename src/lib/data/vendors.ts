import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { LAUNCH_CATEGORIES, LAUNCH_CITY } from "@/lib/config";
import { PUBLIC_VENDOR_COLUMNS } from "@/lib/vendor-columns";
import { PORTFOLIO_COLUMNS, REVIEW_COLUMNS } from "@/lib/public-columns";

export async function getFeaturedVendors(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_providers")
    .select(PUBLIC_VENDOR_COLUMNS)
    .eq("status", "approved")
    .in("service_type", LAUNCH_CATEGORIES)
    // Real vendors before sample listings, then founding vendors, then
    // newest. Rating isn't a useful default until there are real reviews.
    .order("is_demo", { ascending: true })
    .order("founding_vendor", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id")
    .limit(limit);

  return data ?? [];
}

export type VendorFilters = {
  q?: string;
  category?: string;
  eventType?: string;
  minPrice?: number;
  maxPrice?: number;
};

export async function searchVendors(filters: VendorFilters = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("service_providers")
    .select(PUBLIC_VENDOR_COLUMNS)
    .eq("status", "approved")
    .in("service_type", LAUNCH_CATEGORIES);

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
  if (filters.minPrice != null) {
    query = query.gte("hourly_rate", filters.minPrice);
  }
  if (filters.maxPrice != null) {
    query = query.lte("hourly_rate", filters.maxPrice);
  }

  const { data } = await query
    .order("is_demo", { ascending: true })
    .order("founding_vendor", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id");
  return data ?? [];
}

export async function getVendorById(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_providers")
    .select(PUBLIC_VENDOR_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return data;
}

export async function getVendorPortfolio(providerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("portfolio_items")
    .select(PORTFOLIO_COLUMNS)
    .eq("provider_id", providerId)
    .order("sort_order", { ascending: true, nullsFirst: false });

  return data ?? [];
}

export async function getVendorReviews(providerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .order("id");

  return data ?? [];
}

export const launchCity = LAUNCH_CITY;

export type SimilarVendor = { id: string; name: string; hourly_rate: number; city: string | null };

/**
 * Up to `limit` approved vendors in a category, founding first then newest —
 * the fallback suggestions when a quote request expires or is declined.
 * Takes any client so the cron route (service role) can use it too.
 */
export async function findSimilarVendors(
  client: SupabaseClient<Database>,
  serviceType: string,
  excludeIds: string[] = [],
  limit = 3
): Promise<SimilarVendor[]> {
  if (!LAUNCH_CATEGORIES.includes(serviceType as (typeof LAUNCH_CATEGORIES)[number])) return [];
  const { data } = await client
    .from("service_providers")
    .select("id, name, hourly_rate, city")
    .eq("status", "approved")
    .eq("service_type", serviceType)
    .order("is_demo", { ascending: true })
    .order("founding_vendor", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id")
    .limit(limit + excludeIds.length);
  return (data ?? []).filter((v) => !excludeIds.includes(v.id)).slice(0, limit);
}
