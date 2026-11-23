import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { shareFromNext, preparedSource, type SharePreparedAction } from "@/lib/share-profile";

// The Share profile funnel (table public.share_funnel_events, read by
// admin_share_funnel): customer accounts created from a shared vendor
// profile, and vendors preparing a share. Visits come from page_views and
// quote requests from quote_requests.share_source. Nothing personal beyond
// the account id; recording must never break the flow it measures.

/** A new customer account whose sign-up started from a shared profile (?next= carries it). */
export async function recordShareAccount(userId: string, next: string | null | undefined, detail: "email" | "google" | "apple") {
  const share = shareFromNext(next);
  if (!share) return;
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { error } = await admin
      .from("share_funnel_events")
      .insert({ event: "account_created", source: share.source, vendor_id: share.vendorId, user_id: userId, detail });
    // 23505: this account was already counted (one row per account).
    if (error && error.code !== "23505") console.error("[share-funnel] account", error.message);
  } catch (e) {
    console.error("[share-funnel] account", e instanceof Error ? e.message : e);
  }
}

/** A vendor saved, copied or shared their artwork or link (intent only — not a post). */
export async function recordSharePrepared(userId: string, vendorId: string, action: SharePreparedAction) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { error } = await admin
      .from("share_funnel_events")
      .insert({ event: "prepared", source: preparedSource(action), vendor_id: vendorId, user_id: userId, detail: action });
    if (error) console.error("[share-funnel] prepared", error.message);
  } catch (e) {
    console.error("[share-funnel] prepared", e instanceof Error ? e.message : e);
  }
}
