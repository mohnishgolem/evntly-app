import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getUnreadMessageCount } from "@/lib/data/user";
import { getVendorQuotes } from "@/lib/data/vendor-quotes";
import { sydneyDate } from "@/lib/event-dates";

export type AttentionItem = {
  key: string;
  kind: "enquiry" | "confirm" | "review" | "photos";
  title: string;
  detail?: string;
  href: string;
};

// What needs the vendor now, from real data only: new quote requests,
// bookings waiting for their confirmation, listings under review and
// listings without photos. Shared by Home, the header bell, the tab bar and
// the sidebar, and cached per request so they cost one set of queries.
export const getVendorAttention = cache(async function getVendorAttention() {
  const session = await getCurrentUser();
  if (!session) return null;

  const supabase = await createClient();
  const { data: listings } = await supabase
    .rpc("my_service_providers")
    .select("id, name, status, available, verified, rating, review_count, acceptance_rate, avg_response_hours");
  if (!listings || listings.length === 0) return null;

  const today = sydneyDate();
  const [{ enquiries, quotes }, unread, { data: upcoming }, { data: portfolioRows }] = await Promise.all([
    getVendorQuotes(),
    getUnreadMessageCount(),
    supabase
      .from("bookings")
      .select("id, provider_id, event_date, event_time, status, client_label, client_user_id")
      .eq("provider_owner_user_id", session.user.id)
      .in("status", ["pending", "confirmed"])
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(20),
    supabase.from("portfolio_items").select("provider_id").in("provider_id", listings.map((l) => l.id)),
  ]);

  const bookings = upcoming ?? [];
  const needsConfirm = bookings.filter((b) => b.status === "pending");
  const withPhotos = new Set((portfolioRows ?? []).map((r) => r.provider_id));
  const missingPhotos = listings.filter((l) => !withPhotos.has(l.id));
  const underReview = listings.filter((l) => l.status === "pending_review");

  const items: AttentionItem[] = [
    ...enquiries.map((q) => ({
      key: `enquiry-${q.id}`,
      kind: "enquiry" as const,
      title: `${q.client_name ?? "A customer"} wants a price · ${q.event_type}`,
      detail: q.event_date ?? undefined,
      href: "/vendor-dashboard/enquiries",
    })),
    ...needsConfirm.map((b) => ({
      key: `confirm-${b.id}`,
      kind: "confirm" as const,
      title: `Confirm booking${b.client_label ? ` with ${b.client_label}` : ""}`,
      detail: [b.event_date, b.event_time].filter(Boolean).join(" · "),
      href: "/vendor-dashboard/bookings",
    })),
    ...underReview.map((l) => ({
      key: `review-${l.id}`,
      kind: "review" as const,
      title: `${l.name} is being reviewed`,
      detail: "We'll email you when it's live.",
      href: "/vendor-dashboard/business",
    })),
    ...missingPhotos.map((l) => ({
      key: `photos-${l.id}`,
      kind: "photos" as const,
      title: `Add photos to ${l.name}`,
      detail: "Listings without photos are easy to skip.",
      href: "/vendor-dashboard/portfolio",
    })),
  ];

  return {
    listings,
    enquiries,
    quotes,
    upcoming: bookings,
    needsConfirm,
    underReview,
    missingPhotos,
    unread,
    items,
    /** Leads tab badge: requests waiting on the vendor's reply. */
    leadCount: enquiries.length,
    /** Header bell: things only the vendor can move forward. */
    notificationCount: enquiries.length + needsConfirm.length,
  };
});

/**
 * Conversation ids the signed-in user is part of. A conversation page 404s
 * until it has a message, so Leads and Bookings only link to one that exists.
 */
export const getMyConversationIds = cache(async function getMyConversationIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_conversations");
  return (data ?? []).map((c) => c.conversation_id);
});
