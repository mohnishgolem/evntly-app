import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/data/user";
import { loadEventBoard } from "@/lib/data/event-board";
import { AdminMfaRequired } from "@/components/admin-mfa-required";
import { EventHeader } from "@/components/event-board/board-cards";
import { VendorTeam } from "@/components/event-board/vendor-team";
import { categoryLabel } from "@/lib/config";
import { effectiveQuoteStatus } from "@/lib/quote-expiry";

export const metadata: Metadata = {
  title: "Event",
  robots: { index: false, follow: false },
};

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });

// Read-only: admins can see the board to resolve support issues, but every
// action (shortlist, quote, book, pay) stays with the customer. Payment
// fixes (refunds, retries, disputes) live on /admin/payments.
export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, needsEnrol } = await requireAdminPage(`/admin/events/${id}`);
  if (needsEnrol) return <AdminMfaRequired />;

  const board = await loadEventBoard(id, { userId: session.user.id, savedVendorIds: [], asAdmin: true });
  if (!board) notFound();
  const { event, categories, quotes, bookings, progress } = board;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/events" className="mb-3 -ml-1 inline-flex h-11 items-center gap-1 px-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> All events
      </Link>
      <p className="mb-3 rounded-xl bg-muted px-4 py-3 text-sm">
        Viewing as admin (read-only). Organiser: <strong>{event.organiser_email}</strong> · Event id <code>{event.id}</code>
      </p>
      <EventHeader event={event} progress={progress} />

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Vendor team</h2>
        {categories.length ? (
          <VendorTeam eventId={event.id} categories={categories} readOnly />
        ) : (
          <p className="text-sm text-muted-foreground">No vendor categories chosen.</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Quotes ({quotes.length})</h2>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border text-sm">
            {quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-medium">{q.vendor_name ?? "Vendor"}</span>{" "}
                  <span className="text-muted-foreground">({categoryLabel(q.service_type ?? "")})</span>
                </span>
                <span className="capitalize text-muted-foreground">
                  {effectiveQuoteStatus(q)}
                  {q.quoted_amount != null && ` · ${aud(Number(q.quoted_amount))}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Bookings & payments ({bookings.length})</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border text-sm">
            {bookings.map((b) => (
              <li key={b.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {b.provider_name ?? "Vendor"} <span className="font-normal text-muted-foreground">({categoryLabel(b.service_type)})</span>
                  </span>
                  <span className="capitalize">{b.status}</span>
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  {b.total_price != null && `${aud(Number(b.total_price))} · `}
                  {b.payment.label}
                  {b.payment.releasedCents > 0 && ` · ${aud(b.payment.releasedCents / 100)} released`}
                </p>
                <Link href="/admin/payments" className="mt-1 inline-flex h-9 items-center text-sm underline underline-offset-2">
                  Manage payments
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
