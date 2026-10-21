import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Clock,
  FileText,
  ImagePlus,
  Inbox,
  MessageCircle,
  PartyPopper,
  type LucideIcon,
} from "lucide-react";
import { getCurrentUser, getUnreadMessageCount } from "@/lib/data/user";
import { getVendorQuotes } from "@/lib/data/vendor-quotes";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { sydneyDate } from "@/lib/event-dates";
import { quoteExpiresSoon, quoteTimeLeft, effectiveQuoteStatus } from "@/lib/quote-expiry";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Vendor dashboard",
  robots: { index: false, follow: false },
};

function Stat({
  href,
  icon: Icon,
  value,
  label,
  urgent,
}: {
  href: string;
  icon: LucideIcon;
  value: number;
  label: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-4 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
        urgent ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <Icon className={cn("size-5", urgent ? "text-primary" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden />
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </Link>
  );
}

// What needs the vendor today: new enquiries first, then quotes waiting on
// customers, upcoming bookings and unread messages.
export default async function VendorOverviewPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard");

  const supabase = await createClient();
  const { data: listings } = await supabase.rpc("my_service_providers").select("id, name, status");

  if (!listings || listings.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">You don&apos;t have a listing yet</h1>
        <p className="mb-6 text-muted-foreground">
          Set up your vendor profile to start appearing in Evntly search.
        </p>
        <Button nativeButton={false} render={<Link href="/vendor-signup">Create my listing</Link>} />
      </div>
    );
  }

  const today = sydneyDate();
  const [{ enquiries, quotes }, unread, { data: bookings }, { data: portfolioRows }] = await Promise.all([
    getVendorQuotes(),
    getUnreadMessageCount(),
    supabase
      .from("bookings")
      .select("id, provider_name, event_date, event_time, status, client_label")
      .eq("provider_owner_user_id", session.user.id)
      .in("status", ["pending", "confirmed"])
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(5),
    supabase.from("portfolio_items").select("provider_id").in("provider_id", listings.map((l) => l.id)),
  ]);

  const awaitingCustomer = quotes.filter((q) => effectiveQuoteStatus(q) === "quoted");
  const needsConfirm = (bookings ?? []).filter((b) => b.status === "pending");
  const withPhotos = new Set((portfolioRows ?? []).map((r) => r.provider_id));
  const missingPhotos = listings.filter((l) => !withPhotos.has(l.id));
  const underReview = listings.filter((l) => l.status === "pending_review");
  const allClear = enquiries.length === 0 && needsConfirm.length === 0 && unread === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Overview</h1>
      <p className="mb-6 text-sm text-muted-foreground">What needs your attention today.</p>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          href="/vendor-dashboard/enquiries"
          icon={Inbox}
          value={enquiries.length}
          label="New enquiries"
          urgent={enquiries.length > 0}
        />
        <Stat
          href="/vendor-dashboard/quotes"
          icon={FileText}
          value={awaitingCustomer.length}
          label="Quotes awaiting customer"
        />
        <Stat
          href="/vendor-dashboard/bookings"
          icon={CalendarDays}
          value={bookings?.length ?? 0}
          label="Upcoming bookings"
          urgent={needsConfirm.length > 0}
        />
        <Stat href="/messages" icon={MessageCircle} value={unread} label="Unread messages" urgent={unread > 0} />
      </div>

      <section aria-labelledby="attention" className="mb-8">
        <h2 id="attention" className="mb-3 text-lg font-semibold">
          Needs attention
        </h2>
        {allClear && missingPhotos.length === 0 && underReview.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl border border-border px-4 py-4 text-sm text-muted-foreground">
            <PartyPopper className="size-4" aria-hidden /> You&apos;re all caught up.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {enquiries.slice(0, 3).map((q) => (
              <li key={q.id}>
                <Link
                  href="/vendor-dashboard/enquiries"
                  className="flex items-center gap-3 px-4 py-3.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <Inbox className="size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {q.client_name ?? "A customer"} wants a price · {q.event_type}
                    </span>
                    <span
                      className={cn(
                        "block text-xs",
                        quoteExpiresSoon(q) ? "font-medium text-warning" : "text-muted-foreground",
                      )}
                    >
                      {q.event_date} · reply {quoteTimeLeft(q)?.replace(/^in /, "within ") ?? "soon"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
            {enquiries.length > 3 && (
              <li>
                <Link href="/vendor-dashboard/enquiries" className="block px-4 py-3 text-sm font-medium hover:bg-muted/60">
                  See all {enquiries.length} enquiries
                </Link>
              </li>
            )}
            {needsConfirm.map((b) => (
              <li key={b.id}>
                <Link
                  href="/vendor-dashboard/bookings"
                  className="flex items-center gap-3 px-4 py-3.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <Clock className="size-5 shrink-0 text-warning" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      Confirm booking{b.client_label ? ` with ${b.client_label}` : ""}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {b.event_date}
                      {b.event_time ? ` · ${b.event_time}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
            {unread > 0 && (
              <li>
                <Link
                  href="/messages"
                  className="flex items-center gap-3 px-4 py-3.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <MessageCircle className="size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1 text-sm font-medium">
                    {unread} unread message{unread === 1 ? "" : "s"}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            )}
            {underReview.map((l) => (
              <li key={`review-${l.id}`} className="flex items-center gap-3 px-4 py-3.5 text-sm">
                <Clock className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                <span className="flex-1">
                  <span className="font-medium">{l.name}</span> is being reviewed — we&apos;ll email you when it&apos;s live.
                </span>
              </li>
            ))}
            {missingPhotos.map((l) => (
              <li key={`photos-${l.id}`}>
                <Link
                  href="/vendor-dashboard/portfolio"
                  className="flex items-center gap-3 px-4 py-3.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <ImagePlus className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">Add photos to {l.name}.</span>{" "}
                    <span className="text-muted-foreground">Listings without photos are easy to skip.</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(bookings?.length ?? 0) > 0 && (
        <section aria-labelledby="upcoming">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="upcoming" className="text-lg font-semibold">
              Upcoming bookings
            </h2>
            <Link href="/vendor-dashboard/calendar" className="text-sm font-medium underline underline-offset-2">
              Calendar
            </Link>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {bookings!.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{b.client_label ?? "Customer"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {b.event_date}
                    {b.event_time ? ` · ${b.event_time}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium capitalize text-muted-foreground">{b.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
