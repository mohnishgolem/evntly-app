import type { Database } from "@/lib/supabase/database.types";

// anon/authenticated only have column-level SELECT on these — the vendor's
// contact details (owner_email, phone, social_link, contact_name,
// service_address, unit_number) are revoked so they can't be scraped through
// the public REST API. `select("*")` on service_providers therefore fails;
// select these instead. A vendor reads their own full rows through the
// `my_service_providers` RPC, admins through `admin_service_providers`.
export const PUBLIC_VENDOR_COLUMNS =
  "id, created_at, updated_at, created_by, name, bio, service_type, description, hourly_rate, rating, review_count, rating_sum, acceptance_rate, avg_response_hours, verified, founding_vendor, latitude, longitude, city, postcode, avatar_url, portfolio_urls, equipment_list, available, experience_years, event_types, languages, packages, pricing_options, status, service_radius_km, unavailable_dates, weekly_unavailable_days, cancellation_policy, locations_serviced, abn, gst_registered, is_demo, min_booking_hours, free_travel_km, travel_fee_cents_per_km, travels_regional, availability_confirmed_at" as const;

export type PublicVendor = Omit<
  Database["public"]["Tables"]["service_providers"]["Row"],
  | "owner_email"
  | "owner_user_id"
  | "phone"
  | "social_link"
  | "contact_name"
  | "service_address"
  | "unit_number"
>;
