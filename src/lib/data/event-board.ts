import "server-only";

import { createClient } from "@/lib/supabase/server";
import { PUBLIC_VENDOR_COLUMNS, type PublicVendor } from "@/lib/vendor-columns";
import { BOOKING_COLUMNS, type ParticipantBooking } from "@/lib/public-columns";
import { quoteTimeLeft } from "@/lib/quote-expiry";
import {
  TEAM_STATUS_ORDER,
  isAvailableOn,
  matchesEvent,
  nextStep,
  paymentSummary,
  planningProgress,
  vendorStanding,
  type BoardMilestone,
  type BoardPlan,
  type BoardQuote,
  type NextStep,
  type PaymentSummary,
} from "@/lib/event-board";
import { locateEvent } from "@/lib/data/events";
import { sydneyDate } from "@/lib/event-dates";
import type { TeamCategory, TeamVendor } from "@/components/event-board/vendor-team";
import type { Database } from "@/lib/supabase/database.types";

type Event = Database["public"]["Tables"]["events"]["Row"];

// Enough candidates per category to count availability honestly; the board
// shows the best few and the count.
const CANDIDATE_LIMIT = 400;

// Quote columns both an organiser and an admin may read (no emails).
const QUOTE_COLUMNS =
  "id, vendor_id, vendor_name, service_type, status, expires_at, quoted_amount, created_at, event_date, event_type, location, estimated_guests, budget_range, vendor_note, booking_id" as const;

export type BoardQuoteRow = BoardQuote & {
  vendor_name: string | null;
  event_date: string;
  vendor_note: string | null;
  booking_id: string | null;
};

export type BoardBookingView = ParticipantBooking & { payment: PaymentSummary };

export type EventBoardData = {
  event: Event;
  categories: TeamCategory[];
  quotes: BoardQuoteRow[];
  bookings: BoardBookingView[];
  progress: ReturnType<typeof planningProgress>;
  step: NextStep;
  availableByService: Map<string, number>;
  locked: boolean;
};

function rankVendors(a: PublicVendor, b: PublicVendor) {
  return (
    Number(a.is_demo ?? false) - Number(b.is_demo ?? false) ||
    Number(b.verified ?? false) - Number(a.verified ?? false) ||
    Number(b.founding_vendor ?? false) - Number(a.founding_vendor ?? false) ||
    (b.rating ?? 0) - (a.rating ?? 0) ||
    (b.review_count ?? 0) - (a.review_count ?? 0) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Everything the Event Board shows, read under the caller's own RLS:
 * organisers see their own event; admins (events_select_admin) see any.
 * `asAdmin` only switches to queries that don't assume the caller is the
 * organiser — it grants nothing by itself.
 */
export async function loadEventBoard(
  eventId: string,
  viewer: { userId: string; savedVendorIds: string[]; asAdmin?: boolean }
): Promise<EventBoardData | null> {
  const supabase = await createClient();

  let eventQuery = supabase.from("events").select("*").eq("id", eventId);
  if (!viewer.asAdmin) eventQuery = eventQuery.eq("organiser_user_id", viewer.userId);
  const { data: event } = await eventQuery.maybeSingle();
  if (!event) return null;

  if (!viewer.asAdmin && event.latitude == null && event.suburb) {
    const located = await locateEvent(event.id, event.suburb);
    if (located) Object.assign(event, located);
  }

  const organiserId = event.organiser_user_id ?? viewer.userId;
  const [shortlistRes, quotesRes, bookingsRes, bookedRes, candidatesRes] = await Promise.all([
    supabase.from("event_vendors").select("provider_id, service_type").eq("event_id", eventId),
    supabase
      .from("quote_requests")
      .select(QUOTE_COLUMNS)
      .eq("event_id", eventId)
      .eq("client_user_id", organiserId)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .eq("event_id", eventId)
      .eq("client_user_id", organiserId)
      .order("created_at", { ascending: false }),
    supabase.rpc("booked_vendor_ids_on", { p_date: event.event_date }),
    event.required_services.length
      ? supabase
          .from("service_providers")
          .select(PUBLIC_VENDOR_COLUMNS)
          .eq("status", "approved")
          .in("service_type", event.required_services)
          .limit(CANDIDATE_LIMIT)
      : Promise.resolve({ data: [] as PublicVendor[] }),
  ]);

  const shortlist = shortlistRes.data ?? [];
  const quotes = (quotesRes.data ?? []) as BoardQuoteRow[];
  const bookings = (bookingsRes.data ?? []) as ParticipantBooking[];
  const bookedIds = new Set<string>((bookedRes.data as string[] | null) ?? []);
  const candidates = (candidatesRes.data ?? []) as PublicVendor[];

  // Vendors on the team who aren't in the candidate list (another category,
  // paused listing, or past the limit) are fetched by id so they still show.
  const teamIds = new Set([
    ...shortlist.map((s) => s.provider_id),
    ...quotes.map((q) => q.vendor_id).filter((id): id is string => !!id),
    ...bookings.map((b) => b.provider_id),
  ]);
  const known = new Map(candidates.map((v) => [v.id, v]));
  const missing = [...teamIds].filter((id) => !known.has(id));
  if (missing.length) {
    const { data } = await supabase.from("service_providers").select(PUBLIC_VENDOR_COLUMNS).in("id", missing);
    for (const v of (data ?? []) as PublicVendor[]) known.set(v.id, v);
  }

  // Payments: the existing milestone plans, read-only here.
  const bookingIds = bookings.map((b) => b.id);
  let plans: BoardPlan[] = [];
  let milestones: BoardMilestone[] = [];
  if (bookingIds.length) {
    const { data } = await supabase
      .from("payment_plans")
      .select("id, booking_id, status, total_cents")
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: false });
    plans = data ?? [];
    if (plans.length) {
      const { data: ms } = await supabase
        .from("payment_milestones")
        .select("plan_id, kind, amount_cents, funding_status, payout_status, work_status")
        .in(
          "plan_id",
          plans.map((p) => p.id)
        );
      milestones = ms ?? [];
    }
  }
  const planByBooking = new Map<string, BoardPlan>();
  for (const p of plans) if (!planByBooking.has(p.booking_id)) planByBooking.set(p.booking_id, p);
  const bookingViews: BoardBookingView[] = bookings.map((b) => ({
    ...b,
    payment: paymentSummary(planByBooking.get(b.id), milestones),
  }));

  // ── Group by category ──
  const shortlisted = new Set(shortlist.map((s) => s.provider_id));
  const saved = new Set(viewer.savedVendorIds);
  const standingInput = { bookings, quotes, shortlisted };

  const toTeamVendor = (v: PublicVendor): TeamVendor => {
    const standing = vendorStanding(v.id, standingInput);
    const booking = standing.booking ? bookingViews.find((b) => b.id === standing.booking!.id) : undefined;
    return {
      id: v.id,
      service: v.service_type,
      name: v.name,
      avatarUrl: v.avatar_url,
      verified: !!v.verified,
      rating: v.rating,
      reviewCount: v.review_count ?? 0,
      city: v.city,
      hourlyRate: Number(v.hourly_rate) || 0,
      availableOnDate: isAvailableOn(v, event.event_date, bookedIds) || !!booking,
      saved: saved.has(v.id),
      status: standing.status,
      quoteId: standing.quote?.id,
      quotedAmount: standing.quote?.quoted_amount != null ? Number(standing.quote.quoted_amount) : null,
      quoteTimeLeft: standing.quote ? quoteTimeLeft(standing.quote) : null,
      bookingId: booking?.id,
      bookingPrice: booking?.total_price != null ? Number(booking.total_price) : null,
      payment: booking?.payment,
    };
  };

  const availableByService = new Map<string, number>();
  const shortlistByService = new Map<string, number>();
  const categories: TeamCategory[] = event.required_services.map((service) => {
    const inCategory = [...known.values()].filter((v) => v.service_type === service);
    const matching = inCategory.filter((v) => matchesEvent(v, event, bookedIds)).sort(rankVendors);
    availableByService.set(service, inCategory.filter((v) => isAvailableOn(v, event.event_date, bookedIds)).length);

    const team = inCategory
      .filter((v) => teamIds.has(v.id))
      .map(toTeamVendor)
      .filter((v) => v.status !== "suggested")
      .sort((a, b) => TEAM_STATUS_ORDER.indexOf(a.status) - TEAM_STATUS_ORDER.indexOf(b.status));
    shortlistByService.set(service, team.filter((v) => v.status === "shortlisted").length);

    const onTeam = new Set(team.map((v) => v.id));
    const suggestions = matching
      .filter((v) => !onTeam.has(v.id))
      .slice(0, 12)
      .map(toTeamVendor);

    return { service, availableCount: availableByService.get(service) ?? 0, team, suggestions };
  });

  const due = bookingViews.find((b) => b.status !== "cancelled" && b.payment.actionDue);
  const step = nextStep({
    requiredServices: event.required_services,
    availableByService,
    bookings,
    quotes,
    shortlistByService,
    paymentDueBookingId: due?.id ?? null,
    paymentDueVendorName: due?.provider_name ?? null,
    eventPast: event.event_date < sydneyDate(),
  });

  return {
    event,
    categories,
    quotes,
    bookings: bookingViews,
    progress: planningProgress(event.required_services, bookings),
    step,
    availableByService,
    locked: bookings.some((b) => b.status === "pending" || b.status === "confirmed"),
  };
}

