import type { Database } from "@/lib/supabase/database.types";

// Column lists for tables whose rows are publicly readable. Users have no
// SELECT on the email (or user-id) columns of these tables, so `select("*")`
// fails — select these instead. Keep in sync with the grants in the
// hide_emails_on_public_rows migration.
type Tables = Database["public"]["Tables"];

export const REVIEW_COLUMNS =
  "id, created_at, updated_at, provider_id, booking_id, reviewer_name, rating, comment, event_type, description" as const;
export type PublicReview = Omit<Tables["reviews"]["Row"], "reviewer_email" | "reviewer_user_id" | "created_by">;

export const PORTFOLIO_COLUMNS =
  "id, created_at, updated_at, provider_id, media_type, media_url, thumbnail_url, caption, event_type_tag, sort_order" as const;
export type PublicPortfolioItem = Omit<
  Tables["portfolio_items"]["Row"],
  "owner_email" | "owner_user_id" | "created_by"
>;

export const PACKAGE_COLUMNS =
  "id, created_at, updated_at, name, description, cover_image, category, initiating_vendor_id, initiating_vendor_name, status, bundle_discount_amount, total_price, participant_count" as const;
export type PublicPackage = Omit<
  Tables["combined_packages"]["Row"],
  "initiating_vendor_email" | "initiating_vendor_user_id" | "participant_emails" | "participant_user_ids" | "created_by"
>;

export const PARTICIPANT_COLUMNS =
  "id, created_at, updated_at, combined_package_id, combined_package_name, vendor_id, vendor_name, package_id, package_name, component_price, acceptance_status, is_initiator" as const;
export type PublicParticipant = Omit<
  Tables["combined_package_participants"]["Row"],
  | "vendor_email"
  | "vendor_user_id"
  | "initiating_vendor_email"
  | "initiating_vendor_user_id"
  | "proposed_by_email"
  | "proposed_by_user_id"
  | "created_by"
>;
