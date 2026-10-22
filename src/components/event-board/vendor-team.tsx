"use client";

import Link from "next/link";
import { createElement, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ChevronDown, Loader2, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveVendorButton } from "@/components/save-vendor-button";
import { categoryIcon, categoryLabel, categoryPlural } from "@/lib/config";
import { setShortlisted } from "@/lib/actions/event-board";
import { requestQuotesForEvent, type InviteResult } from "@/lib/actions/event-vendors";
import { acceptQuote } from "@/lib/actions/quotes";
import { priceTier, TEAM_STATUS_LABEL, type PaymentSummary, type TeamStatus } from "@/lib/event-board";
import { cn } from "@/lib/utils";
import { QuoteDetails, type QuoteDetailFields } from "@/components/quote-details";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { quoteTimeLeft } from "@/lib/quote-expiry";

export type TeamVendor = {
  id: string;
  service: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  rating: number | null;
  reviewCount: number;
  city: string | null;
  hourlyRate: number;
  availableOnDate: boolean;
  saved: boolean;
  status: TeamStatus;
  quoteId?: string;
  quotedAmount?: number | null;
  quoteTimeLeft?: string | null;
  bookingId?: string;
  bookingPrice?: number | null;
  payment?: PaymentSummary;
  /** Smart-matching result, when matching is on and the vendor passed Stage A. */
  match?: TeamMatch;
};

export type TeamMatch = {
  score: number;
  reason: string;
  /** Passed every check with a current calendar; false = availability pending. */
  confirmed: boolean;
  outsideUsualArea: boolean;
  distanceKm: number | null;
  pending: string[];
  estimate: {
    totalCents: number;
    travelCents: number;
    basis: "package" | "hourly";
    packageName: string | null;
    inclusions: string[];
    notes: string[];
  } | null;
};

export type CompareQuote = QuoteDetailFields & {
  id: string;
  vendor_id: string | null;
  vendor_name: string;
  status: string;
  expires_at: string | null;
  match_score: number | null;
};

export type TeamCategory = {
  service: string;
  /** Quote requests still pending or quoted (max 5 per category). */
  openRequests: number;
  /** Priced quotes awaiting the customer, cheapest first. */
  quoted: CompareQuote[];
  /** The latest request that was declined or expired, if nothing replaced it. */
  lost: { name: string; kind: "declined" | "expired" } | null;
  availableCount: number;
  /** Confirmed matches (null when smart matching is off). */
  confirmedCount: number | null;
  /** This category's budget in cents, if known. */
  budgetCents: number | null;
  /** Results include vendors from outside their usual area. */
  widened: boolean;
  /** Vendors the customer has acted on (shortlisted, quoted, booked…). */
  team: TeamVendor[];
  /** Matching vendors not yet on the team, best first. */
  suggestions: TeamVendor[];
};

const STATUS_STYLE: Record<TeamStatus, string> = {
  confirmed: "bg-success/10 text-success",
  booked: "bg-champagne/15 text-warning",
  quoted: "bg-primary/10 text-primary",
  requested: "bg-muted text-muted-foreground",
  declined: "bg-destructive/10 text-destructive",
  shortlisted: "bg-foreground/[0.06] text-foreground",
  suggested: "",
};

const PAYMENT_TONE: Record<PaymentSummary["tone"], string> = {
  neutral: "text-muted-foreground",
  attention: "text-warning",
  active: "text-primary",
  success: "text-success",
};

const SUGGESTIONS_SHOWN = 3;
/** Same limit the server and database enforce. */
const MAX_OPEN_REQUESTS = 5;
const SHEET_CLASS =
  "max-h-[90dvh] overflow-y-auto rounded-t-3xl px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-h-dvh sm:rounded-none";

function useSheetSide() {
  const [side] = useState<"bottom" | "right">(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches ? "right" : "bottom"
  );
  return side;
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}

function availabilityLine(c: TeamCategory) {
  const confirmed = c.team.find((v) => v.status === "confirmed");
  if (confirmed) return `Confirmed: ${confirmed.name}`;
  const booked = c.team.find((v) => v.status === "booked");
  if (booked) return `${booked.name} is confirming`;
  if (c.availableCount === 0) return c.confirmedCount != null ? "No matches yet" : "No vendors available on your date yet";
  if (c.confirmedCount != null) {
    if (c.confirmedCount > 0) return `${c.confirmedCount} confirmed match${c.confirmedCount === 1 ? "" : "es"}`;
    return `${c.availableCount} possible match${c.availableCount === 1 ? "" : "es"} · availability pending`;
  }
  return `${c.availableCount} vendor${c.availableCount === 1 ? "" : "s"} available on your date`;
}

export function VendorTeam({
  eventId,
  categories,
  initialOpen,
  readOnly = false,
}: {
  eventId: string;
  categories: TeamCategory[];
  initialOpen?: string | null;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(initialOpen ? [initialOpen] : []));

  function toggle(service: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(service)) next.delete(service);
      else next.add(service);
      return next;
    });
  }

  return (
    <ul className="space-y-3">
      {categories.map((c) => {
        const isOpen = open.has(c.service);
        const Icon = categoryIcon(c.service);
        const panelId = `team-${c.service}`;
        const done = c.team.some((v) => v.status === "confirmed");
        return (
          <li
            key={c.service}
            id={`category-${c.service}`}
            className={cn(
              "scroll-mt-24 overflow-hidden rounded-2xl border bg-card transition-colors duration-300",
              isOpen ? "border-champagne/50" : "border-border"
            )}
          >
            <button
              type="button"
              onClick={() => toggle(c.service)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex min-h-[4.5rem] w-full items-center gap-3.5 px-4 py-3 text-left outline-none focus-visible:bg-muted/60 sm:px-5"
            >
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-xl",
                  done ? "bg-success/10 text-success" : "bg-muted text-foreground"
                )}
              >
                <Icon className="size-[22px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{categoryLabel(c.service)}</span>
                <span className="block truncate text-sm text-muted-foreground">{availabilityLine(c)}</span>
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-5 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none",
                  isOpen && "rotate-180"
                )}
              />
            </button>

            {/* grid-rows 0fr → 1fr animates to the content's natural height. */}
            <div
              id={panelId}
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="min-h-0 overflow-hidden" inert={!isOpen}>
                <CategoryPanel eventId={eventId} category={c} readOnly={readOnly} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CategoryPanel({ eventId, category, readOnly }: { eventId: string; category: TeamCategory; readOnly: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const filled = category.team.some((v) => v.status === "confirmed" || v.status === "booked");
  const suggestions = showAll ? category.suggestions : category.suggestions.slice(0, SUGGESTIONS_SHOWN);
  const smart = category.confirmedCount != null;
  const best = suggestions.filter((v) => !smart || v.match?.confirmed);
  const pending = smart ? suggestions.filter((v) => !v.match?.confirmed) : [];

  const invitable = [
    ...category.team.filter((v) => v.status === "shortlisted" || v.status === "declined"),
    ...category.suggestions.filter((v) => v.status === "suggested"),
  ];
  const slots = Math.max(0, MAX_OPEN_REQUESTS - category.openRequests);
  const nextBest = category.suggestions.find((v) => v.status === "suggested");

  return (
    <div className="space-y-4 px-2.5 pb-3 sm:px-4 sm:pb-4">
      {!readOnly && (category.quoted.length > 0 || (!filled && invitable.length > 0)) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {category.quoted.length > 0 && <CompareQuotesSheet category={category} />}
          {!filled && invitable.length > 0 && slots > 0 && (
            <RequestQuotesSheet eventId={eventId} category={category} vendors={invitable} slots={slots} />
          )}
        </div>
      )}

      {!readOnly && !filled && category.lost && nextBest && (
        <InviteAnother eventId={eventId} lost={category.lost} next={nextBest} />
      )}

      {category.team.length > 0 && (
        <section>
          <h3 className="px-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Your team</h3>
          <ul className="space-y-2">
            {category.team.map((v) => (
              <VendorRow key={v.id} eventId={eventId} vendor={v} readOnly={readOnly} />
            ))}
          </ul>
        </section>
      )}

      {!filled && (
        <section>
          <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {smart ? "Best matches" : "Suggested for your date"}
            </h3>
            {category.budgetCents != null && (
              <span className="text-xs text-muted-foreground">Budget {formatCents(category.budgetCents)}</span>
            )}
          </div>
          {category.widened && (
            <p className="px-1 pb-2 text-xs text-muted-foreground">
              Few vendors cover your suburb, so we&apos;ve included some who travel further.
            </p>
          )}
          {suggestions.length === 0 ? (
            <div className="rounded-xl bg-muted/60 px-4 py-5 text-sm text-muted-foreground">
              No {categoryPlural(category.service)} match your date, area and budget yet.{" "}
              {smart && "Post your event to the Event Feed and new vendors can send you quotes. "}
              <Link
                href={`/explore?category=${category.service}`}
                className="font-medium text-foreground underline underline-offset-2"
              >
                Browse all {categoryPlural(category.service)}
              </Link>
            </div>
          ) : (
            <>
              {best.length > 0 ? (
                <ul className="space-y-2">
                  {best.map((v) => (
                    <VendorRow key={v.id} eventId={eventId} vendor={v} readOnly={readOnly} />
                  ))}
                </ul>
              ) : (
                smart && (
                  <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                    No confirmed matches yet. These vendors fit your event but haven&apos;t confirmed their calendar.
                  </p>
                )
              )}
              {pending.length > 0 && (
                <>
                  <h3 className="px-1 pt-4 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Availability pending
                  </h3>
                  <ul className="space-y-2">
                    {pending.map((v) => (
                      <VendorRow key={v.id} eventId={eventId} vendor={v} readOnly={readOnly} />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {category.suggestions.length > SUGGESTIONS_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="mt-2 h-11 w-full rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              {showAll ? "Show fewer" : `Show ${category.suggestions.length - SUGGESTIONS_SHOWN} more`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function VendorRow({ eventId, vendor: v, readOnly }: { eventId: string; vendor: TeamVendor; readOnly: boolean }) {
  return (
    <li className="rounded-2xl border border-border bg-background p-3 transition-shadow hover:shadow-sm sm:p-4">
      <div className="flex gap-3">
        <Link href={`/vendor/${v.id}`} className="relative shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {v.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.avatarUrl} alt="" className="size-14 rounded-xl object-cover sm:size-[4.5rem]" loading="lazy" />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-xl bg-muted sm:size-[4.5rem]">
              {createElement(categoryIcon(v.service), { className: "size-6 text-muted-foreground", "aria-hidden": true })}
            </span>
          )}
          {v.availableOnDate && (
            <span
              className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full border-2 border-background bg-success"
              title="Available on your date"
            />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={`/vendor/${v.id}`} className="block outline-none focus-visible:underline">
            <span className="flex items-center gap-1">
              <span className="truncate font-semibold">{v.name}</span>
              {v.verified && <BadgeCheck className="size-4 shrink-0 text-[#2f7cf6]" aria-label="Verified" />}
            </span>
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-champagne text-champagne" aria-hidden />
              {v.rating && v.reviewCount > 0 ? (
                <>
                  <span className="font-medium text-foreground">{v.rating.toFixed(1)}</span> ({v.reviewCount})
                </>
              ) : (
                <span className="font-medium text-foreground">New</span>
              )}
            </span>
            {v.city && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{v.city}</span>
              </span>
            )}
          </p>
          {v.match && <MatchSummary match={v.match} />}
          {v.status !== "suggested" && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", STATUS_STYLE[v.status])}>
                {TEAM_STATUS_LABEL[v.status]}
              </span>
              <StatusDetail vendor={v} />
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {v.match?.estimate ? (
            <span className="text-right">
              <span className="block text-sm font-semibold">{formatCents(v.match.estimate.totalCents)}</span>
              <span className="block text-[11px] text-muted-foreground">estimate</span>
            </span>
          ) : (
            <span className="text-sm font-semibold" title={`From $${v.hourlyRate}/hr`}>
              {priceTier(v.hourlyRate)}
              <span className="sr-only"> (from ${v.hourlyRate} per hour)</span>
            </span>
          )}
          {!readOnly && (
            <SaveVendorButton vendorId={v.id} initialSaved={v.saved} isAuthenticated size="lg" className="-mr-2 shadow-none" />
          )}
        </div>
      </div>

      {!readOnly && <RowActions eventId={eventId} vendor={v} />}
    </li>
  );
}

function MatchSummary({ match: m }: { match: TeamMatch }) {
  const [open, setOpen] = useState(false);
  const e = m.estimate;
  return (
    <div className="mt-1.5 space-y-1 text-xs">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{m.score}% match</span>
        {m.confirmed ? (
          <span className="rounded-full bg-success/10 px-2 py-0.5 font-medium text-success">Calendar up to date</span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">Availability pending</span>
        )}
        {m.outsideUsualArea && (
          <span className="rounded-full bg-champagne/15 px-2 py-0.5 font-medium text-warning">Outside usual area</span>
        )}
      </p>
      {/* Two lines on phones; the full reason is in the details panel. */}
      <p className="line-clamp-2 text-muted-foreground sm:line-clamp-none">{m.reason}</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-ml-1 min-h-11 px-1 font-medium text-foreground underline-offset-2 hover:underline"
      >
        {open ? "Hide details" : "Price & details"}
      </button>
      {open && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-muted/50 p-3 text-muted-foreground">
          <dt className="sm:hidden">Why</dt>
          <dd className="sm:hidden">{m.reason}</dd>
          {e ? (
            <>
              <dt>Estimate</dt>
              <dd className="text-foreground">
                {formatCents(e.totalCents)}
                {e.packageName ? ` · ${e.packageName}` : e.basis === "hourly" ? " · hourly rate" : ""}
              </dd>
              {e.travelCents > 0 && (
                <>
                  <dt>Travel</dt>
                  <dd>{formatCents(e.travelCents)} included</dd>
                </>
              )}
              {e.inclusions.length > 0 && (
                <>
                  <dt>Includes</dt>
                  <dd>{e.inclusions.join(" · ")}</dd>
                </>
              )}
              {e.notes.length > 0 && (
                <>
                  <dt>Note</dt>
                  <dd>{e.notes.join(". ")}</dd>
                </>
              )}
            </>
          ) : (
            <>
              <dt>Price</dt>
              <dd>Ask for a quote</dd>
            </>
          )}
          {m.distanceKm != null && (
            <>
              <dt>Distance</dt>
              <dd>About {m.distanceKm} km</dd>
            </>
          )}
          {m.pending.length > 0 && (
            <>
              <dt>Pending</dt>
              <dd>{m.pending.join(". ")}</dd>
            </>
          )}
          <dd className="col-span-2 pt-1 text-[11px]">
            Estimates use the vendor&apos;s own prices. Their quote is what you book.
          </dd>
        </dl>
      )}
    </div>
  );
}

function StatusDetail({ vendor: v }: { vendor: TeamVendor }) {
  if (v.status === "quoted" && v.quotedAmount != null) {
    return (
      <span className="text-muted-foreground">
        ${v.quotedAmount.toLocaleString()} quoted{v.quoteTimeLeft ? ` · expires ${v.quoteTimeLeft}` : ""}
      </span>
    );
  }
  if (v.status === "requested") {
    return <span className="text-muted-foreground">Waiting for a reply{v.quoteTimeLeft ? ` · closes ${v.quoteTimeLeft}` : ""}</span>;
  }
  if ((v.status === "booked" || v.status === "confirmed") && v.payment) {
    return <span className={cn("font-medium", PAYMENT_TONE[v.payment.tone])}>{v.payment.label}</span>;
  }
  return null;
}

function RowActions({ eventId, vendor: v }: { eventId: string; vendor: TeamVendor }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"quote" | "book" | null>(null);

  function run(key: string, action: () => Promise<{ error?: string } | null | undefined>) {
    setError(null);
    setBusy(key);
    startTransition(async () => {
      const res = await action();
      setBusy(null);
      setConfirming(null);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const spinner = (key: string) => busy === key && pending && <Loader2 className="animate-spin" aria-hidden />;

  let actions: React.ReactNode;
  if (confirming === "quote") {
    actions = (
      <>
        <p className="w-full text-sm">Send {v.name} a quote request with your event details?</p>
        <Button size="lg" disabled={pending} onClick={() => run("quote", () => requestQuotesForEvent(eventId, [v.id]))}>
          {spinner("quote")} Send request
        </Button>
        <Button size="lg" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
          Cancel
        </Button>
      </>
    );
  } else if (confirming === "book" && v.quoteId) {
    actions = (
      <>
        <p className="w-full text-sm">
          Book {v.name} for ${v.quotedAmount?.toLocaleString()}? They&apos;ll confirm, then set up payments.
        </p>
        <Button size="lg" disabled={pending} onClick={() => run("book", () => acceptQuote(v.quoteId!))}>
          {spinner("book")} Book
        </Button>
        <Button size="lg" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
          Cancel
        </Button>
      </>
    );
  } else {
    switch (v.status) {
      case "suggested":
        actions = (
          <>
            <Button size="lg" variant="outline" disabled={pending} onClick={() => run("shortlist", () => setShortlisted(eventId, v.id, true))}>
              {spinner("shortlist")} Shortlist
            </Button>
            <Button size="lg" variant="outline" disabled={pending} onClick={() => setConfirming("quote")}>
              Request quote
            </Button>
          </>
        );
        break;
      case "shortlisted":
      case "declined":
        actions = (
          <>
            <Button size="lg" disabled={pending} onClick={() => setConfirming("quote")}>
              Request quote
            </Button>
            {v.status === "shortlisted" && (
              <Button size="lg" variant="ghost" disabled={pending} onClick={() => run("remove", () => setShortlisted(eventId, v.id, false))}>
                {spinner("remove")} Remove
              </Button>
            )}
          </>
        );
        break;
      case "quoted":
        actions = (
          <>
            <Button size="lg" disabled={pending} onClick={() => setConfirming("book")}>
              Book for ${v.quotedAmount?.toLocaleString()}
            </Button>
            <Button size="lg" variant="ghost" nativeButton={false} render={<Link href="/dashboard/quotes">Quote details</Link>} />
          </>
        );
        break;
      case "requested":
        actions = (
          <>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/dashboard/quotes">View request</Link>} />
          </>
        );
        break;
      case "booked":
      case "confirmed":
        actions = (
          <Button
            size="lg"
            variant={v.payment?.actionDue ? "default" : "outline"}
            nativeButton={false}
            render={<Link href={`/bookings/${v.bookingId}`}>{v.payment?.actionDue ? "Review & pay" : "Booking & payments"}</Link>}
          />
        );
        break;
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Batch quote requests ────────────────────────────────────────────────

function RequestQuotesSheet({
  eventId,
  category,
  vendors,
  slots,
}: {
  eventId: string;
  category: TeamCategory;
  vendors: TeamVendor[];
  slots: number;
}) {
  const router = useRouter();
  const side = useSheetSide();
  const [open, setOpen] = useState(false);
  const initial = () =>
    new Set(
      vendors
        .filter((v) => v.status !== "declined")
        .slice(0, Math.min(3, slots))
        .map((v) => v.id)
    );
  const [picked, setPicked] = useState<Set<string>>(initial);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<InviteResult | null>(null);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < slots) next.add(id);
      return next;
    });
  }

  function send() {
    setResult(null);
    startTransition(async () => {
      const res = await requestQuotesForEvent(eventId, [...picked]);
      setResult(res);
      if (res.success) router.refresh();
    });
  }

  const plural = categoryPlural(category.service);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setPicked(initial());
          setResult(null);
        }
      }}
    >
      <SheetTrigger render={<Button size="lg" variant={category.quoted.length ? "outline" : "default"} />}>
        Request quotes
      </SheetTrigger>
      <SheetContent side={side} className={SHEET_CLASS}>
        <SheetHeader className="px-0">
          <SheetTitle>Request quotes from {plural}</SheetTitle>
          <SheetDescription>
            Pick up to {slots}. We&apos;ll send each one your event details — not your contact details — and they have 7
            days to reply.
          </SheetDescription>
        </SheetHeader>

        {result?.success ? (
          <div className="space-y-3">
            <p className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-success">
              Sent to {result.sent} {result.sent === 1 ? categoryLabel(category.service).toLowerCase() : plural}. Quotes will
              appear on your board.
            </p>
            <SkippedList skipped={result.skipped} />
            <Button size="lg" className="w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {vendors.map((v) => {
                const on = picked.has(v.id);
                const disabled = !on && picked.size >= slots;
                return (
                  <li key={v.id}>
                    <label
                      className={cn(
                        "flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                        on ? "border-foreground bg-foreground/[0.03]" : "border-border",
                        disabled && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <Checkbox checked={on} disabled={disabled} onCheckedChange={() => toggle(v.id)} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{v.name}</span>
                          {v.match?.estimate && (
                            <span className="shrink-0 text-sm font-semibold">{formatCents(v.match.estimate.totalCents)}</span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {v.match ? `${v.match.score}% match · ${v.match.confirmed ? "calendar up to date" : "availability pending"}` : TEAM_STATUS_LABEL[v.status]}
                          {v.status === "declined" ? " · declined before" : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {result?.error && (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-destructive">
                  {result.error}
                </p>
                <SkippedList skipped={result.skipped} />
              </div>
            )}
            <Button size="lg" className="w-full" disabled={pending || picked.size === 0} onClick={send}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Send {picked.size} request{picked.size === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SkippedList({ skipped }: { skipped?: { name: string; reason: string }[] }) {
  if (!skipped?.length) return null;
  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      {skipped.map((s) => (
        <li key={s.name}>
          <span className="font-medium text-foreground">{s.name}</span> not sent: {s.reason}
        </li>
      ))}
    </ul>
  );
}

// ── Quote comparison ────────────────────────────────────────────────────

function CompareQuotesSheet({ category }: { category: TeamCategory }) {
  const side = useSheetSide();
  const n = category.quoted.length;
  return (
    <Sheet>
      <SheetTrigger render={<Button size="lg" />}>{n === 1 ? "Review quote" : `Compare ${n} quotes`}</SheetTrigger>
      <SheetContent side={side} className={cn(SHEET_CLASS, "data-[side=right]:sm:max-w-2xl")}>
        <SheetHeader className="px-0">
          <SheetTitle>{categoryLabel(category.service)} quotes</SheetTitle>
          <SheetDescription>
            Cheapest first. Quotes are offers — nothing is booked until you choose one and the vendor confirms.
          </SheetDescription>
        </SheetHeader>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {category.quoted.map((q, i) => (
            <li key={q.id} className="flex min-w-0 flex-col rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/vendor/${q.vendor_id}`} className="font-semibold hover:underline">
                  {q.vendor_name}
                </Link>
                {i === 0 && n > 1 && (
                  <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Lowest</span>
                )}
              </div>
              <p className="mt-1 text-2xl font-semibold">{q.quoted_amount != null ? `$${Number(q.quoted_amount).toLocaleString("en-AU")}` : "—"}</p>
              <p className="text-xs text-muted-foreground">
                {q.match_score != null ? `${q.match_score}% match · ` : ""}
                {quoteTimeLeft(q) ? `expires ${quoteTimeLeft(q)}` : ""}
              </p>
              <div className="flex-1">
                <QuoteDetails quote={q} />
              </div>
              <BookQuoteButton quoteId={q.id} vendorName={q.vendor_name} amount={q.quoted_amount} />
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function BookQuoteButton({ quoteId, vendorName, amount }: { quoteId: string; vendorName: string; amount: number | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {confirming ? (
        <>
          <p className="text-sm">
            Book {vendorName} for ${Number(amount ?? 0).toLocaleString("en-AU")}? They&apos;ll confirm, then set up payments.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await acceptQuote(quoteId);
                  if (res?.error) setError(res.error);
                  else router.refresh();
                })
              }
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />} Book
            </Button>
            <Button size="lg" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Button size="lg" variant="outline" className="w-full" aria-label={`Choose ${vendorName}`} onClick={() => setConfirming(true)}>
          Choose
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Replacing a vendor who declined or didn't reply ─────────────────────

function InviteAnother({
  eventId,
  lost,
  next,
}: {
  eventId: string;
  lost: { name: string; kind: "declined" | "expired" };
  next: TeamVendor;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="rounded-xl border border-champagne/50 bg-champagne/10 p-3 text-sm">
      <p>
        {lost.kind === "declined" ? `${lost.name} can't take your event.` : `${lost.name} didn't reply in time.`} Invite{" "}
        <span className="font-semibold">{next.name}</span>
        {next.match ? ` (${next.match.score}% match)` : ""} instead?
      </p>
      {error && (
        <p role="alert" className="mt-1 text-destructive">
          {error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="lg"
          disabled={pending}
          aria-label={`Invite ${next.name}`}
          onClick={() =>
            startTransition(async () => {
              const res = await requestQuotesForEvent(eventId, [next.id]);
              if (res.error) setError(res.error);
              else router.refresh();
            })
          }
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />} Invite
        </Button>
        <Button size="lg" variant="ghost" disabled={pending} onClick={() => setDismissed(true)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
