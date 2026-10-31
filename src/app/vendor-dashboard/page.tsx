import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  FileText,
  ImagePlus,
  Inbox,
  PartyPopper,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { getVendorAttention } from "@/lib/data/vendor-attention";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { sydneyDate } from "@/lib/event-dates";
import { quoteExpiresSoon, quoteTimeLeft, effectiveQuoteStatus } from "@/lib/quote-expiry";
import { cn } from "@/lib/utils";
import { completenessPercent, profileChecklist, type ChecklistItem } from "@/lib/profile-completeness";
import { getMyFoundingStatus } from "@/lib/data/founding";
import { CLAIM_PATH } from "@/lib/founding/sources";

export const metadata: Metadata = {
  title: "Vendor dashboard",
  robots: { index: false, follow: false },
};

const money = (dollars: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(dollars);

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

// Profile strength for the main listing: a short to-do list until it's
// complete, then it disappears.
function ProfileStrength({ name, items }: { name: string; items: ChecklistItem[] }) {
  const percent = completenessPercent(items);
  if (percent === 100) return null;
  return (
    <section aria-labelledby="profile-strength" className="mb-8 rounded-2xl border border-border p-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="profile-strength" className="text-lg font-semibold">
          Finish your profile
        </h2>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{percent}% complete</span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} profile completeness`}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mb-3 text-sm text-muted-foreground">Complete profiles get more enquiries. Each step takes a minute or two.</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.key}>
            {i.done ? (
              <span className="flex items-center gap-2.5 px-1 py-1.5 text-sm text-muted-foreground line-through">
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                {i.label}
                <span className="sr-only"> (done)</span>
              </span>
            ) : (
              <Link href={i.href} className="flex min-h-10 items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm font-medium outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1">{i.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Founding vendor beta: where the application stands, linking to the
// status page (or the beta checklist once approved). Hidden for vendors who
// never claimed a place, or who withdrew.
async function FoundingCard() {
  const status = await getMyFoundingStatus();
  const app = status?.application;
  if (!app || app.status === "withdrawn") return null;
  const approved = app.status === "approved";
  const text: Record<string, string> = {
    started: "Finish setting up your listing to submit your founding vendor application.",
    submitted: "Your founding vendor application is pending review.",
    needs_changes: "We've asked for a few changes to your listing before approving your founding place.",
    rejected: "We couldn't offer you a founding place this time.",
    approved: "You're a founding vendor. Open your beta checklist and send us feedback.",
  };
  return (
    <Link
      href={approved ? "/vendor-dashboard/beta" : CLAIM_PATH}
      className={cn(
        "mb-8 flex items-center gap-3 rounded-2xl border p-4 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
        approved || app.status === "needs_changes" ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <PartyPopper className="size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
      <span className="flex-1 text-sm">
        <span className="block font-semibold">Founding vendor beta</span>
        <span className="block text-muted-foreground">{text[app.status]}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border px-3.5 py-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      {label}
    </Link>
  );
}

// Home: what needs the vendor today, then how the business is doing, then
// shortcuts. Every number comes from the vendor's own rows; nothing is
// estimated or filled in.
export default async function VendorHomePage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard");

  const attention = await getVendorAttention();
  if (!attention) {
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

  const { listings, enquiries, quotes, upcoming, needsConfirm, underReview, missingPhotos, unread } = attention;

  // Earnings summary, same rules as Analytics: earned = completed bookings
  // this Australian financial year; booked = confirmed and still to come.
  const supabase = await createClient();
  const today = sydneyDate();
  const fyStartYear = Number(today.slice(5, 7)) >= 7 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const { data: earningRows, error: earningsError } = await supabase
    .from("bookings")
    .select("status, total_price, event_date")
    .eq("provider_owner_user_id", session.user.id)
    .in("status", ["completed", "confirmed"]);
  const earnedFy = (earningRows ?? [])
    .filter((b) => b.status === "completed" && b.event_date >= `${fyStartYear}-07-01` && b.event_date <= `${fyStartYear + 1}-06-30`)
    .reduce((t, b) => t + Number(b.total_price ?? 0), 0);
  const bookedAhead = (earningRows ?? [])
    .filter((b) => b.status === "confirmed" && b.event_date >= today)
    .reduce((t, b) => t + Number(b.total_price ?? 0), 0);

  const [{ data: details }, { count: photoCount }, { count: packageCount }] = await Promise.all([
    supabase.rpc("my_service_providers").select("bio, abn, locations_serviced, event_types").eq("id", listings[0].id).maybeSingle(),
    supabase.from("portfolio_items").select("id", { count: "exact", head: true }).eq("provider_id", listings[0].id),
    supabase.from("vendor_packages").select("id", { count: "exact", head: true }).eq("provider_id", listings[0].id).eq("active", true),
  ]);
  const checklist = details
    ? profileChecklist({ id: listings[0].id, ...details, photoCount: photoCount ?? 0, packageCount: packageCount ?? 0 })
    : [];

  const awaitingCustomer = quotes.filter((q) => effectiveQuoteStatus(q) === "quoted");
  const allClear = attention.items.length === 0 && unread === 0;
  const primary = listings[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Home</h1>
      <p className="mb-6 text-sm text-muted-foreground">What needs your attention today.</p>

      <FoundingCard />

      {checklist.length > 0 && <ProfileStrength name={listings[0].name} items={checklist} />}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          href="/vendor-dashboard/enquiries"
          icon={Inbox}
          value={enquiries.length}
          label="New enquiries"
          urgent={enquiries.length > 0}
        />
        <Stat href="/vendor-dashboard/quotes" icon={FileText} value={awaitingCustomer.length} label="Quotes awaiting customer" />
        <Stat
          href="/vendor-dashboard/bookings"
          icon={CalendarDays}
          value={upcoming.length}
          label="Upcoming bookings"
          urgent={needsConfirm.length > 0}
        />
        <Stat
          href="/vendor-dashboard/bookings"
          icon={CalendarClock}
          value={needsConfirm.length}
          label="Waiting for you to confirm"
          urgent={needsConfirm.length > 0}
        />
      </div>

      <section aria-labelledby="attention" className="mb-8">
        <h2 id="attention" className="mb-3 text-lg font-semibold">
          Needs attention
        </h2>
        {allClear ? (
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
                  <Inbox className="size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
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

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming" className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="upcoming" className="text-lg font-semibold">
              Upcoming bookings
            </h2>
            <Link href="/vendor-dashboard/calendar" className="text-sm font-medium underline underline-offset-2">
              Calendar
            </Link>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {upcoming.slice(0, 5).map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bookings/${b.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.client_label ?? "Customer"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {b.event_date}
                      {b.event_time ? ` · ${b.event_time}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium capitalize text-muted-foreground">{b.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="business" className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="business" className="text-lg font-semibold">
            Your business
          </h2>
          <Link href="/vendor-dashboard/earnings" className="text-sm font-medium underline underline-offset-2">
            Analytics
          </Link>
        </div>
        {earningsError ? (
          <p className="rounded-2xl border border-border px-4 py-4 text-sm text-muted-foreground">
            We couldn&apos;t load your earnings just now. Refresh to try again.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border p-4">
              <p className="text-2xl font-bold tabular-nums">{money(earnedFy)}</p>
              <p className="text-sm text-muted-foreground">
                Earned FY {fyStartYear}–{String(fyStartYear + 1).slice(2)}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-4">
              <p className="text-2xl font-bold tabular-nums">{money(bookedAhead)}</p>
              <p className="text-sm text-muted-foreground">Confirmed, still to come</p>
            </div>
          </div>
        )}

        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border text-sm">
          {listings.map((l) => (
            <li key={l.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-6">
              <span className="truncate font-medium">{l.name}</span>
              <span className="text-muted-foreground">
                {l.review_count ? `★ ${Number(l.rating ?? 0).toFixed(1)} (${l.review_count})` : "No reviews yet"}
              </span>
              <span className="text-muted-foreground">
                {l.acceptance_rate != null ? `${Math.round(l.acceptance_rate * 100)}% replied` : "Reply rate: not enough requests yet"}
              </span>
              <span className="text-muted-foreground">
                {l.avg_response_hours != null ? `Replies in ~${Math.round(l.avg_response_hours)}h` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="actions">
        <h2 id="actions" className="mb-3 text-lg font-semibold">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <QuickAction href={`/vendor-dashboard/edit/${primary.id}`} icon={PencilLine} label="Edit listing" />
          <QuickAction href="/vendor-dashboard/portfolio" icon={ImagePlus} label="Add photos or videos" />
          <QuickAction href="/vendor-dashboard/calendar" icon={CalendarDays} label="Update availability" />
          {primary.status === "approved" && (
            <QuickAction href={`/vendor/${primary.id}`} icon={Eye} label="View as a customer" />
          )}
        </div>
      </section>
    </div>
  );
}
