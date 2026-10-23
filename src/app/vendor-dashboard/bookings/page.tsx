import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireVendor } from "@/lib/data/user";
import { getMyConversationIds } from "@/lib/data/conversations";
import { DashboardNav } from "@/components/dashboard-nav";
import { sydneyDate } from "@/lib/event-dates";
import { createClient } from "@/lib/supabase/server";
import { VendorBookingActions } from "@/components/vendor-booking-actions";
import { JobCardPanel } from "@/components/job-card-panel";
import { getJobCardForBooking } from "@/lib/data/job-cards";
import { BOOKING_COLUMNS } from "@/lib/public-columns";

export const metadata: Metadata = {
  title: "Bookings",
  robots: { index: false, follow: false },
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-warning",
  confirmed: "text-primary",
  completed: "text-success",
  cancelled: "text-muted-foreground",
};

type Booking = NonNullable<Awaited<ReturnType<typeof loadBookings>>>[number];

async function loadBookings(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("provider_owner_user_id", userId)
    .order("event_date", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

// Confirmed work only lives here — enquiries and quotes stay in Leads.
// Grouped by what the vendor does next: confirm, then do the job, then the
// record of past and cancelled bookings.
export default async function VendorBookingsPage() {
  const session = await requireVendor("/vendor-dashboard/bookings");

  const [bookings, conversationIds] = await Promise.all([loadBookings(session.user.id), getMyConversationIds()]);
  const threads = new Set(conversationIds);

  const jobCards = await Promise.all(
    bookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .map(async (b) => [b.id, await getJobCardForBooking(b.id)] as const)
  );
  const jobCardByBooking = new Map(jobCards);

  const today = sydneyDate();
  const groups: { id: string; title: string; rows: Booking[] }[] = [
    { id: "confirm", title: "Waiting for you to confirm", rows: bookings.filter((b) => b.status === "pending") },
    {
      id: "upcoming",
      title: "Upcoming",
      rows: bookings.filter((b) => b.status === "confirmed" && b.event_date >= today),
    },
    {
      id: "past",
      title: "Past and completed",
      rows: bookings
        .filter((b) => b.status === "completed" || (b.status === "confirmed" && b.event_date < today))
        .reverse(),
    },
    { id: "cancelled", title: "Cancelled", rows: bookings.filter((b) => b.status === "cancelled").reverse() },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Bookings</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Confirmed work from accepted quotes. New requests stay in Leads.
      </p>

      <DashboardNav tabs="vendorBookingsTabs" label="Booking views" />

      {bookings.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No bookings yet. When a customer accepts your quote, the booking appears here.{" "}
          <Link href="/vendor-dashboard/enquiries" className="font-medium text-foreground underline underline-offset-2">
            Go to Leads
          </Link>
        </p>
      ) : (
        <div className="space-y-8">
          {groups
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <section key={g.id} aria-labelledby={`bookings-${g.id}`}>
                <h2 id={`bookings-${g.id}`} className="mb-3 text-sm font-semibold text-muted-foreground">
                  {g.title} ({g.rows.length})
                </h2>
                <div className="space-y-4">
                  {g.rows.map((b) => {
                    const thread = b.client_user_id ? `${b.provider_id}:${b.client_user_id}` : null;
                    const card = jobCardByBooking.get(b.id);
                    return (
                      <div key={b.id} className="rounded-2xl border border-border p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold">{b.client_label ?? "Customer"}</p>
                            <p className="text-sm text-muted-foreground">
                              {b.event_date}
                              {b.event_address ? ` · ${b.event_address}` : ""}
                            </p>
                            {!!b.total_price && <p className="text-sm font-semibold">${b.total_price}</p>}
                            {b.notes && <p className="mt-1 text-sm">{b.notes}</p>}
                          </div>
                          <span className={`text-sm font-medium capitalize ${STATUS_COLOR[b.status] ?? ""}`}>
                            {b.status}
                          </span>
                        </div>
                        <VendorBookingActions bookingId={b.id} status={b.status} />
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <Link
                            href={`/bookings/${b.id}`}
                            className="inline-flex min-h-11 items-center font-medium underline underline-offset-2 sm:min-h-0"
                          >
                            Details, milestones & payments
                          </Link>
                          {(b.status === "confirmed" || b.status === "completed") && (
                            <Link
                              href={`/bookings/${b.id}/invoice`}
                              className="inline-flex min-h-11 items-center underline underline-offset-2 sm:min-h-0"
                            >
                              Invoice
                            </Link>
                          )}
                          {thread && threads.has(thread) && (
                            <Link
                              href={`/messages/${encodeURIComponent(thread)}`}
                              className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-2 sm:min-h-0"
                            >
                              <MessageCircle className="size-4" aria-hidden /> Message
                            </Link>
                          )}
                        </div>
                        {card?.jobCard && (
                          <JobCardPanel jobCard={card.jobCard} checklist={card.checklist} viewer="vendor" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
