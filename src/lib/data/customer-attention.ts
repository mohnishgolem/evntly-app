import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/user";
import { effectiveQuoteStatus, quoteTimeLeft } from "@/lib/quote-expiry";
import { sydneyDate } from "@/lib/event-dates";
import type { AttentionItem } from "@/lib/data/vendor-attention";

const SOON_DAYS = 14;

// The customer's notifications bell, from real data only (there's no
// notifications table): quotes waiting for them to accept or decline,
// bookings still waiting on the vendor, and confirmed bookings coming up.
// Only the quotes count towards the badge — they're the customer's move.
export const getCustomerAttention = cache(async function getCustomerAttention() {
  const session = await getCurrentUser();
  if (!session) return null;

  const supabase = await createClient();
  const today = sydneyDate();
  const soon = sydneyDate(SOON_DAYS);
  const [{ data: quotes }, { data: bookings }] = await Promise.all([
    supabase.rpc("my_quote_requests", { as_role: "client" }),
    supabase
      .from("bookings")
      .select("id, provider_name, event_date, status")
      .eq("client_user_id", session.user.id)
      .in("status", ["pending", "confirmed"])
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(20),
  ]);

  const toDecide = (quotes ?? []).filter((q) => effectiveQuoteStatus(q) === "quoted");
  const waiting = (bookings ?? []).filter((b) => b.status === "pending");
  const comingUp = (bookings ?? []).filter((b) => b.status === "confirmed" && b.event_date <= soon);

  const items: AttentionItem[] = [
    ...toDecide.map((q) => ({
      key: `quote-${q.id}`,
      kind: "quote" as const,
      title: `${q.vendor_name ?? "A vendor"} sent a quote${q.quoted_amount != null ? ` · $${q.quoted_amount}` : ""}`,
      detail: quoteTimeLeft(q) ? `Accept or decline ${quoteTimeLeft(q)!.replace(/^in /, "within ")}` : undefined,
      href: "/dashboard/quotes",
    })),
    ...waiting.map((b) => ({
      key: `waiting-${b.id}`,
      kind: "waiting" as const,
      title: `Waiting for ${b.provider_name ?? "the vendor"} to confirm`,
      detail: b.event_date,
      href: "/dashboard/bookings",
    })),
    ...comingUp.map((b) => ({
      key: `booking-${b.id}`,
      kind: "booking" as const,
      title: `${b.provider_name ?? "Your vendor"} is booked`,
      detail: b.event_date,
      href: `/bookings/${b.id}`,
    })),
  ];

  return { items, notificationCount: toDecide.length };
});
