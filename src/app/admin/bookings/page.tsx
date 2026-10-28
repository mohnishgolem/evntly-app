import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdminPage } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { effectiveQuoteStatus } from "@/lib/quote-expiry";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Bookings",
  robots: { index: false, follow: false },
};

const LIMIT = 100;

const STATUS_CLASS: Record<string, string> = {
  pending: "text-warning",
  quoted: "text-primary",
  accepted: "text-success",
  confirmed: "text-success",
  completed: "text-success",
  declined: "text-destructive",
  cancelled: "text-muted-foreground",
  expired: "text-muted-foreground",
};

const QUOTE_LABEL: Record<string, string> = {
  pending: "Waiting on vendor",
  quoted: "Quoted",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled by customer",
  expired: "Expired",
};

const BOOKING_LABEL: Record<string, string> = {
  pending: "Waiting for vendor to confirm",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" }) : "";

// Booking activity across the marketplace: requests (quotes) and the
// bookings they turn into. Read-only — admins act from the booking page.
// quote_requests_select_participant / bookings_select_participant (RLS)
// let admins read every row through is_admin().
export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { needsEnrol } = await requireAdminPage("/admin/bookings");
  if (needsEnrol) return <AdminMfaRequired />;
  const view = (await searchParams).view === "bookings" ? "bookings" : "requests";

  const supabase = await createClient();
  const since = daysAgoIso(30);
  const [{ data: requests, error: requestsError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase
      .from("quote_requests")
      .select("id, vendor_id, vendor_name, client_name, event_type, event_date, status, expires_at, quoted_amount, created_at, origin")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("bookings")
      .select("id, provider_name, client_name, service_type, event_date, status, total_price, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
  ]);

  const recentRequests = (requests ?? []).filter((r) => r.created_at >= since);
  const recentBookings = (bookings ?? []).filter((b) => (b.created_at ?? "") >= since);
  const tiles = [
    { label: "Requests (30 days)", value: recentRequests.length },
    { label: "Awaiting a vendor reply", value: (requests ?? []).filter((r) => effectiveQuoteStatus(r) === "pending").length },
    { label: "Bookings (30 days)", value: recentBookings.length },
    { label: "Awaiting vendor confirmation", value: (bookings ?? []).filter((b) => b.status === "pending").length },
  ];
  const error = view === "requests" ? requestsError : bookingsError;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Bookings" description="Quote requests and the bookings they become, newest first." />

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{t.label}</dt>
            <dd className="text-xl font-bold tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Booking activity" className="mb-4 flex gap-2">
        {[
          { key: "requests", label: "Requests" },
          { key: "bookings", label: "Bookings" },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/admin/bookings?view=${t.key}`}
            aria-current={view === t.key ? "page" : undefined}
            className={
              view === t.key
                ? "inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background"
                : "inline-flex h-10 items-center rounded-full border border-border px-4 text-sm text-muted-foreground"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {error ? (
        <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Couldn&apos;t load {view}: {error.message}
        </p>
      ) : view === "requests" ? (
        !requests?.length ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {requests.map((r) => {
              const status = effectiveQuoteStatus(r);
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {r.client_name ?? "A customer"} → {r.vendor_name ?? "vendor"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {r.event_type} · {r.event_date}
                      {r.quoted_amount != null ? ` · $${r.quoted_amount}` : ""} · sent {day(r.created_at)}
                      {r.origin && r.origin !== "vendor_profile" ? ` · ${r.origin.replace("_", " ")}` : ""}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-sm font-medium", STATUS_CLASS[status])}>{QUOTE_LABEL[status] ?? status}</span>
                </li>
              );
            })}
          </ul>
        )
      ) : !bookings?.length ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No bookings yet.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link href={`/bookings/${b.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {b.client_name ?? "A customer"} → {b.provider_name ?? "vendor"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {b.event_date}
                    {b.total_price != null ? ` · $${b.total_price}` : ""} · booked {day(b.created_at)}
                  </p>
                </div>
                <span className={cn("shrink-0 text-sm font-medium", STATUS_CLASS[b.status ?? ""])}>
                  {BOOKING_LABEL[b.status ?? ""] ?? b.status}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Showing the latest {LIMIT} of each.</p>
    </div>
  );
}
