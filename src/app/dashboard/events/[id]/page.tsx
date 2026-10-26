import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/config";
import { getJobCardForBooking } from "@/lib/data/job-cards";
import { loadEventBoard } from "@/lib/data/event-board";
import { PostEventButton } from "@/components/post-event-button";
import { QuoteList } from "@/components/quote-list";
import { BookingList } from "@/components/booking-list";
import { BudgetTracker } from "@/components/budget-tracker";
import { VendorTeam } from "@/components/event-board/vendor-team";
import { CategoriesSheet, DeleteEventButton, EditEventSheet } from "@/components/event-board/event-editors";
import { shortTime } from "@/lib/event-times";
import { EventHeader, NextStepCard } from "@/components/event-board/board-cards";
import { summarizeBudget } from "@/lib/budget";
import { effectiveQuoteStatus } from "@/lib/quote-expiry";
import { conversationIdFor } from "@/lib/messages";

export const metadata: Metadata = {
  title: "Event board",
  robots: { index: false, follow: false },
};

const QUOTE_GROUPS = [
  { key: "quoted", title: "Waiting on you" },
  { key: "pending", title: "Waiting on vendors" },
  { key: "accepted", title: "Accepted" },
  { key: "closed", title: "Declined & expired" },
] as const;

function quoteGroup(status: string) {
  if (status === "quoted" || status === "pending" || status === "accepted") return status;
  return "closed";
}

export default async function EventBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ open?: string }>;
}) {
  const session = await getCurrentUser();
  const { id } = await params;
  if (!session) redirect(`/login?next=${encodeURIComponent(`/dashboard/events/${id}`)}`);
  const { open } = await searchParams;

  const board = await loadEventBoard(id, {
    userId: session.user.id,
    savedVendorIds: session.profile?.saved_providers ?? [],
  });
  if (!board) notFound();
  const { event, categories, bookings, progress, step, availableByService, locked } = board;

  const supabase = await createClient();
  const [{ data: listing }, { data: quotes }, { data: myReviews }, { data: budgetItems }] = await Promise.all([
    supabase.from("event_listings").select("*").eq("source_event_id", id).maybeSingle(),
    // The masked RPC feeds QuoteList (with its accept/cancel actions).
    supabase.rpc("my_quote_requests", { as_role: "client" }).eq("event_id", id),
    supabase.from("reviews").select("booking_id").eq("reviewer_user_id", session.user.id),
    supabase.from("event_budget_items").select("id, label, amount, paid").eq("event_id", id).order("created_at"),
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
  const reviewedBookingIds = new Set((myReviews ?? []).map((r) => r.booking_id).filter((bid): bid is string => !!bid));
  const jobCards = await Promise.all(
    bookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .map(async (b) => [b.id, await getJobCardForBooking(b.id)] as const)
  );
  const jobCardByBooking = new Map(jobCards);
  const payments = new Map(bookings.map((b) => [b.id, b.payment]));

  const openQuotes = allQuotes.filter((q) => effectiveQuoteStatus(q) === "quoted");
  const ownCosts = (budgetItems ?? []).map((i) => ({ ...i, amount: Number(i.amount) }));
  const budgetSummary = summarizeBudget({
    budget: Number(event.budget_total),
    bookings,
    openQuotes,
    items: ownCosts,
  });
  const budgetLines = [
    ...bookings
      .filter((b) => b.status !== "cancelled" && b.total_price != null)
      .map((b) => ({
        id: b.id,
        kind: "booking" as const,
        label: `${b.provider_name ?? "Vendor"} (${categoryLabel(b.service_type)})`,
        amount: Number(b.total_price),
      })),
    ...openQuotes
      .filter((q) => q.quoted_amount != null)
      .map((q) => ({
        id: q.id,
        kind: "quote" as const,
        label: `${q.vendor_name ?? "Vendor"} (${categoryLabel(q.service_type ?? "")})`,
        amount: Number(q.quoted_amount),
      })),
    ...ownCosts.map((i) => ({ id: i.id, kind: "item" as const, label: i.label, amount: i.amount, paid: i.paid })),
  ];

  const activeBookings = bookings.filter((b) => b.status !== "cancelled");

  const eventDone = activeBookings.length > 0 && activeBookings.every((b) => b.status === "completed");
  const initialOpen =
    open && event.required_services.includes(open)
      ? open
      : step.kind === "find" || step.kind === "review-quote" || step.kind === "request-quotes"
        ? step.service
        : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 pb-10 sm:pt-8 lg:max-w-3xl">
      <Link
        href="/dashboard/events"
        className="mb-3 -ml-1 inline-flex h-11 items-center gap-1 rounded-full px-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> All my events
      </Link>

      <EventHeader
        event={event}
        progress={progress}
        actions={
          <EditEventSheet
            event={{
              id: event.id,
              name: event.name,
              eventDate: event.event_date,
              suburb: event.suburb,
              guestCount: event.guest_count,
              budgetTotal: Number(event.budget_total),
              notes: event.notes,
              requiredServices: event.required_services,
              startTime: shortTime(event.start_time),
              endTime: shortTime(event.end_time),
              categoryBudgets: categoryBudgetDollars(event.category_budgets),
              locked,
            }}
          />
        }
      />

      <NextStepCard eventId={event.id} step={step} availableByService={availableByService} />

      <section aria-labelledby="team-heading" className="mb-10">
        <h2 id="team-heading" className="mb-4 text-xl font-bold tracking-tight">
          Your vendor team
        </h2>
        {categories.length > 0 ? (
          <VendorTeam key={initialOpen ?? ""} eventId={event.id} categories={categories} initialOpen={initialOpen} />
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">Add the kinds of vendors you need to see suggestions.</p>
        )}
        <div className="mt-3">
          <CategoriesSheet eventId={event.id} selected={event.required_services} />
        </div>
      </section>

      {allQuotes.length > 0 && (
        <section aria-labelledby="quotes-heading" className="mb-10">
          <h2 id="quotes-heading" className="mb-4 text-xl font-bold tracking-tight">
            Quotes
          </h2>
          <div className="space-y-6">
            {QUOTE_GROUPS.map((g) => {
              const group = allQuotes.filter((q) => quoteGroup(effectiveQuoteStatus(q)) === g.key);
              if (group.length === 0) return null;
              return (
                <div key={g.key}>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {g.title} ({group.length})
                  </h3>
                  <QuoteList quotes={group} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {bookings.length > 0 && (
        <section aria-labelledby="bookings-heading" className="mb-10">
          <h2 id="bookings-heading" className="mb-4 text-xl font-bold tracking-tight">
            Bookings & payments
          </h2>
          <BookingList
            bookings={bookings}
            jobCardByBooking={jobCardByBooking}
            reviewedBookingIds={reviewedBookingIds}
            payments={payments}
          />
        </section>
      )}

      <section className="mb-10">
        <BudgetTracker eventId={event.id} summary={budgetSummary} lines={budgetLines} />
      </section>

      {event.required_services.length > 0 && (
        <section aria-labelledby="feed-heading" className="mb-10">
          <h2 id="feed-heading" className="mb-1 text-xl font-bold tracking-tight">
            Event Feed
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">Let vendors come to you with their own quotes.</p>
          <div className="rounded-2xl border border-border p-5">
            {listing ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm">
                  {applicationCount} application{applicationCount === 1 ? "" : "s"} ·{" "}
                  <span className="capitalize text-muted-foreground">{listing.status}</span>
                </p>
                <Link
                  href="/dashboard/event-feed"
                  className="flex h-11 shrink-0 items-center gap-1 text-sm font-semibold underline underline-offset-2"
                >
                  Manage <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">Not posted yet.</p>
                <PostEventButton eventId={event.id} />
              </>
            )}
          </div>
        </section>
      )}

      {activeBookings.length > 0 && (
        <section aria-labelledby="message-heading" className="mb-10">
          <h2 id="message-heading" className="mb-4 text-xl font-bold tracking-tight">
            Message your vendors
          </h2>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {activeBookings.map((b) => (
              <Link
                key={b.id}
                href={`/messages/${encodeURIComponent(conversationIdFor(b.provider_id, session.user.id))}`}
                className="flex min-h-12 items-center justify-between px-4 py-3 text-sm hover:bg-accent"
              >
                {b.provider_name ?? "Vendor"}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {activeBookings.length > 0 && (
        <Link
          href={`/dashboard/events/${event.id}/day`}
          className="mb-10 flex min-h-14 items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 font-semibold text-primary"
        >
          Open Event Day view <ChevronRight className="h-4 w-4" />
        </Link>
      )}

      {eventDone && (
        <div className="mb-10 flex items-center justify-center gap-2 rounded-2xl border border-success/30 bg-success/5 p-5 text-center font-semibold text-success">
          <PartyPopper className="size-5" /> Event complete
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Link
          href="/dashboard/events"
          className="flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> All my events
        </Link>
        <DeleteEventButton eventId={event.id} />
      </div>
    </div>
  );
}

/** events.category_budgets (cents) → whole dollars for the edit form. */
function categoryBudgetDollars(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0)
      .map(([k, v]) => [k, Math.round(v / 100)])
  );
}
