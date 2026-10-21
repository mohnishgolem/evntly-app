"use client";

import Link from "next/link";
import { createElement, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ChevronDown, Loader2, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveVendorButton } from "@/components/save-vendor-button";
import { categoryIcon, categoryLabel, categoryPlural } from "@/lib/config";
import { setShortlisted } from "@/lib/actions/event-board";
import { requestQuotesForEvent } from "@/lib/actions/event-vendors";
import { acceptQuote } from "@/lib/actions/quotes";
import { priceTier, TEAM_STATUS_LABEL, type PaymentSummary, type TeamStatus } from "@/lib/event-board";
import { cn } from "@/lib/utils";

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
};

export type TeamCategory = {
  service: string;
  availableCount: number;
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

function availabilityLine(c: TeamCategory) {
  const confirmed = c.team.find((v) => v.status === "confirmed");
  if (confirmed) return `Confirmed: ${confirmed.name}`;
  const booked = c.team.find((v) => v.status === "booked");
  if (booked) return `${booked.name} is confirming`;
  if (c.availableCount === 0) return "No vendors available on your date yet";
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

  return (
    <div className="space-y-4 px-2.5 pb-3 sm:px-4 sm:pb-4">
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
          <h3 className="px-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Suggested for your date
          </h3>
          {suggestions.length === 0 ? (
            <div className="rounded-xl bg-muted/60 px-4 py-5 text-sm text-muted-foreground">
              No {categoryPlural(category.service)} match your date, area and budget yet.{" "}
              <Link
                href={`/explore?category=${category.service}`}
                className="font-medium text-foreground underline underline-offset-2"
              >
                Browse all {categoryPlural(category.service)}
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {suggestions.map((v) => (
                <VendorRow key={v.id} eventId={eventId} vendor={v} readOnly={readOnly} />
              ))}
            </ul>
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
          <span className="text-sm font-semibold" title={`From $${v.hourlyRate}/hr`}>
            {priceTier(v.hourlyRate)}
            <span className="sr-only"> (from ${v.hourlyRate} per hour)</span>
          </span>
          {!readOnly && (
            <SaveVendorButton vendorId={v.id} initialSaved={v.saved} isAuthenticated size="lg" className="-mr-2 shadow-none" />
          )}
        </div>
      </div>

      {!readOnly && <RowActions eventId={eventId} vendor={v} />}
    </li>
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
