import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, PartyPopper } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/config";
import { getJobCardForBooking } from "@/lib/data/job-cards";
import { EventStageTracker } from "@/components/event-stage-tracker";
import { PostEventButton } from "@/components/post-event-button";
import { QuoteList } from "@/components/quote-list";
import { BookingList } from "@/components/booking-list";
import { VendorCard } from "@/components/vendor-card";
import { DashboardNav } from "@/components/dashboard-nav";
import type { Database } from "@/lib/supabase/database.types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/events", label: "My Events" },
  { href: "/dashboard/event-feed", label: "Event Feed" },
  { href: "/dashboard/quotes", label: "Quotes" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/bundles", label: "Bundles" },
  { href: "/messages", label: "Messages" },
];

type Event = Database["public"]["Tables"]["events"]["Row"];
type Booking = Database["public"]["Tables"]["bookings"]["Row"];

// Every stage is derived from existing data at render time rather than a
// stored events.status — avoids a second status machine drifting out of
// sync with the real source of truth (booking statuses).
function computeStage({
  event,
  hasAnyQuote,
  bookings,
}: {
  event: Event;
  hasAnyQuote: boolean;
  bookings: Booking[];
}): number {
  const activeBookings = bookings.filter((b) => b.status !== "cancelled");
  const hasAnyFilled = activeBookings.length > 0;
  const allServicesFilled = event.required_services.every((s) =>
    activeBookings.some((b) => b.service_type === s)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(event.event_date);
  const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / 86400000);
  const isImminent = daysUntil <= 2 && hasAnyFilled;
  const isPast = daysUntil < 0;

  const allCompleted = hasAnyFilled && activeBookings.every((b) => b.status === "completed");

  if (allCompleted) return 7;
  if (isPast || isImminent) return 6;
  if (allServicesFilled) return 5;
  if (hasAnyFilled) return 4;
  if (hasAnyQuote) return 3;
  if (event.required_services.length > 0) return 2;
  return 1;
}

export default async function EventBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/events");

  const { id } = await params;
  const email = session.user.email as string;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .eq("organiser_email", email)
    .maybeSingle();

  if (!event) notFound();

  const [{ data: listing }, { data: quotes }, { data: bookings }, { data: myReviews }] =
    await Promise.all([
      supabase.from("event_listings").select("*").eq("source_event_id", id).maybeSingle(),
      supabase.from("quote_requests").select("*").eq("event_id", id).eq("client_email", email),
      supabase
        .from("bookings")
        .select("*")
        .eq("event_id", id)
        .eq("client_email", email)
        .order("event_date", { ascending: false }),
      supabase.from("reviews").select("booking_id").eq("reviewer_email", email),
    ]);

  let applicationCount = 0;
  if (listing) {
    const { count } = await supabase
      .from("event_applications")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listing.id);
    applicationCount = count ?? 0;
  }

  const allQuotes = quotes ?? [];
  const allBookings = bookings ?? [];
  const reviewedBookingIds = new Set(
    (myReviews ?? []).map((r) => r.booking_id).filter((bid): bid is string => !!bid)
  );

  const jobCards = await Promise.all(
    allBookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .map(async (b) => [b.id, await getJobCardForBooking(b.id)] as const)
  );
  const jobCardByBooking = new Map(jobCards);

  const filledServices = new Set(
    allBookings.filter((b) => b.status !== "cancelled").map((b) => b.service_type)
  );
  const unfilledServices = event.required_services.filter((s) => !filledServices.has(s));

  let suggestedVendors: Database["public"]["Tables"]["service_providers"]["Row"][] = [];
  if (unfilledServices.length > 0) {
    const { data } = await supabase
      .from("service_providers")
      .select("*")
      .eq("status", "approved")
      .in("service_type", unfilledServices)
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(8);
    suggestedVendors = data ?? [];
  }

  const stage = computeStage({ event, hasAnyQuote: allQuotes.length > 0, bookings: allBookings });

  const bookedVendors = allBookings.filter((b) => b.status !== "cancelled");

  // A conversation thread only exists once a first message has actually
  // been sent — linking straight to /messages/[conversationId] 404s
  // otherwise (that page notFound()s on an empty thread). Fall back to the
  // vendor's own profile page, where Contact Vendor can start one.
  let existingThreadVendorIds = new Set<string>();
  if (bookedVendors.length > 0) {
    const conversationIds = bookedVendors.map((b) => [b.provider_id, email].sort().join(":"));
    const { data: existingMessages } = await supabase
      .from("messages")
      .select("provider_id")
      .in("conversation_id", conversationIds);
    existingThreadVendorIds = new Set(
      (existingMessages ?? []).map((m) => m.provider_id).filter((pid): pid is string => !!pid)
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">
        {event.event_type} in {event.suburb}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {event.event_date} · {event.guest_count} guests · Budget $
        {event.budget_total.toLocaleString()}
        {event.notes ? ` · ${event.notes}` : ""}
      </p>

      <DashboardNav items={NAV_ITEMS} />

      <EventStageTracker currentStage={stage} />

      {stage >= 2 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Event Feed</h2>
          {listing ? (
            <div className="rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm">
                  {applicationCount} application{applicationCount === 1 ? "" : "s"} ·{" "}
                  <span className="capitalize text-muted-foreground">{listing.status}</span>
                </p>
                <Link
                  href="/dashboard/event-feed"
                  className="flex shrink-0 items-center gap-1 text-sm font-semibold underline underline-offset-2"
                >
                  Manage <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border p-5">
              <p className="mb-4 text-sm text-muted-foreground">
                Not posted yet — post it so vendors can apply directly.
              </p>
              <PostEventButton eventId={event.id} />
            </div>
          )}
        </section>
      )}

      {stage >= 2 && suggestedVendors.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">
            Suggested vendors ({unfilledServices.map(categoryLabel).join(", ")})
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {suggestedVendors.map((v) => (
              <VendorCard key={v.id} vendor={v} isAuthenticated />
            ))}
          </div>
        </section>
      )}

      {stage >= 3 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Quotes</h2>
          {allQuotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotes yet.</p>
          ) : (
            <QuoteList quotes={allQuotes} />
          )}
        </section>
      )}

      {stage >= 4 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Vendor team</h2>
          {allBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <BookingList
              bookings={allBookings}
              jobCardByBooking={jobCardByBooking}
              reviewedBookingIds={reviewedBookingIds}
            />
          )}
        </section>
      )}

      {stage >= 5 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Message your vendors</h2>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {bookedVendors.map((b) => (
              <Link
                key={b.id}
                href={
                  existingThreadVendorIds.has(b.provider_id)
                    ? `/messages/${encodeURIComponent(`${b.provider_id}:${email}`)}`
                    : `/vendor/${b.provider_id}`
                }
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-accent"
              >
                {b.provider_name ?? "Vendor"}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {stage >= 6 && (
        <section className="mb-8">
          <Link
            href={`/dashboard/events/${event.id}/day`}
            className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 font-semibold text-primary"
          >
            Open Event Day view <ChevronRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      {stage === 7 && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-success/30 bg-success/5 p-5 text-center font-semibold text-success">
          <PartyPopper className="size-5" /> Event complete
        </div>
      )}
    </div>
  );
}
