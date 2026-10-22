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

// Participant tables: both sides can read the row, but not each other's
// email. Own rows are found by the *_user_id columns; the customer is shown
// to vendors as client_label ("Jane D.").
export const BOOKING_COLUMNS =
  "id, created_at, updated_at, provider_id, provider_name, service_type, event_date, event_time, duration_hours, total_price, review_prompt_sent, commission_percent, escrow_status, status, event_address, notes, client_name, client_label, vendor_response_deadline, event_id, client_user_id, provider_owner_user_id, start_time, end_time" as const;
// `slot` (generated tsrange for the no-overlap constraint) isn't read by the app.
export type ParticipantBooking = Omit<
  Tables["bookings"]["Row"],
  "client_email" | "provider_owner_email" | "created_by" | "stripe_session_id" | "stripe_payment_intent_id" | "slot"
>;

export const JOB_CARD_COLUMNS =
  "id, created_at, updated_at, booking_id, event_id, provider_id, provider_name, service_type, event_type, event_date, suburb, organiser_name, escrow_amount, peer_services, arrival_time, venue_address, status, on_my_way, on_my_way_at, delivered_at, confirmed_at, vendor_user_id, organiser_user_id" as const;
export type ParticipantJobCard = Omit<
  Tables["job_cards"]["Row"],
  "vendor_email" | "organiser_email" | "created_by"
>;

export const CHECKLIST_COLUMNS =
  "id, created_at, updated_at, job_card_id, label, owner_role, order, status, done_at, vendor_user_id, organiser_user_id, done_by_user_id" as const;
export type ParticipantChecklistItem = Omit<
  Tables["stage_checklist_items"]["Row"],
  "vendor_email" | "organiser_email" | "done_by_email" | "created_by"
>;

export const APPLICATION_COLUMNS =
  "id, created_at, updated_at, listing_id, event_id, vendor_id, vendor_name, service_type, pitch, quoted_amount, status, booking_id, booking_confirmed, vendor_user_id, organiser_user_id" as const;
export type ParticipantApplication = Omit<
  Tables["event_applications"]["Row"],
  "vendor_email" | "organiser_email" | "created_by"
>;

export const GROUP_THREAD_COLUMNS =
  "id, created_at, updated_at, bundle_booking_id, combined_package_id, combined_package_name, customer_name, participant_count, customer_user_id" as const;

export const GROUP_MESSAGE_COLUMNS =
  "id, created_at, updated_at, thread_id, sender_name, content, attachment_file_uri, attachment_type, attachment_thumbnail_uri, sender_user_id" as const;
export type ParticipantGroupMessage = Omit<
  Tables["group_chat_messages"]["Row"],
  "sender_email" | "participant_emails" | "participant_user_ids" | "created_by"
>;

export const BUNDLE_BOOKING_COLUMNS =
  "id, created_at, updated_at, combined_package_id, combined_package_name, customer_name, event_date, event_time, event_address, notes, status, total_amount, platform_fee, payment_status, vendor_count, event_id, customer_user_id" as const;
