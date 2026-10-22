import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Users, Wallet } from "lucide-react";
import { categoryLabel } from "@/lib/config";
import { formatEventTimes, shortTime } from "@/lib/event-times";
import type { NextStep } from "@/lib/event-board";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Event = Database["public"]["Tables"]["events"]["Row"];

const DATE = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

/** Event dates are calendar days; format them without a timezone shift. */
export function formatEventDay(iso: string, short = false) {
  const [y, m, d] = iso.split("-").map(Number);
  return (short ? SHORT_DATE : DATE).format(new Date(Date.UTC(y, m - 1, d)));
}

export function eventTitle(event: Pick<Event, "name" | "event_type" | "suburb">) {
  return event.name || `${event.event_type} in ${event.suburb}`;
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.max(percent, percent > 0 ? 4 : 0)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function progressLabel(p: { done: number; total: number }) {
  if (p.total === 0) return "Add vendor categories to start planning";
  if (p.done === p.total) return "Every vendor confirmed";
  return `${p.done} of ${p.total} vendor${p.total === 1 ? "" : "s"} confirmed`;
}

export function EventHeader({
  event,
  progress,
  actions,
}: {
  event: Event;
  progress: { done: number; total: number; percent: number };
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{event.event_type}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-balance sm:text-[1.75rem]">{eventTitle(event)}</h1>
        </div>
        {actions}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Date</dt>
          <dd>
            {formatEventDay(event.event_date, true)}
            {event.start_time && event.end_time && (
              <span className="block text-xs text-muted-foreground">
                {formatEventTimes(shortTime(event.start_time), shortTime(event.end_time))}
              </span>
            )}
          </dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Location</dt>
          <dd className="truncate">{event.suburb}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Guests</dt>
          <dd>{event.guest_count} guests</dd>
        </div>
        <div className="flex items-center gap-2">
          <Wallet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <dt className="sr-only">Budget</dt>
          <dd>{Number(event.budget_total) > 0 ? aud(Number(event.budget_total)) : "No budget set"}</dd>
        </div>
      </dl>
      <div className="mt-5">
        <ProgressBar percent={progress.percent} label={progressLabel(progress)} />
      </div>
    </header>
  );
}

function stepCopy(eventId: string, step: NextStep, available: Map<string, number>) {
  const board = `/dashboard/events/${eventId}`;
  switch (step.kind) {
    case "add-categories":
      return { title: "Choose your vendors", detail: "Pick the kinds of vendors you need.", href: `${board}#team-heading` };
    case "find": {
      const n = step.available;
      return {
        title: `Find a ${categoryLabel(step.service)}`,
        detail: n === 0 ? "None free on your date yet — browse all of them" : `${n} vendor${n === 1 ? "" : "s"} available on your date`,
        href: n === 0 ? `/explore?category=${step.service}` : `${board}?open=${step.service}#category-${step.service}`,
      };
    }
    case "request-quotes":
      return {
        title: `Get ${categoryLabel(step.service)} quotes`,
        detail: `Request quotes from your ${step.shortlisted} shortlisted vendor${step.shortlisted === 1 ? "" : "s"}`,
        href: `${board}?open=${step.service}#category-${step.service}`,
      };
    case "review-quote":
      return {
        title: `Review your ${categoryLabel(step.service)} quote${step.count === 1 ? "" : "s"}`,
        detail: "Accept one to book it",
        href: `${board}?open=${step.service}#category-${step.service}`,
      };
    case "pay":
      return { title: "Payment needed", detail: `Review and pay ${step.vendorName} to secure your booking`, href: `/bookings/${step.bookingId}` };
    case "awaiting":
      return {
        title: `Waiting on ${categoryLabel(step.service)} quotes`,
        detail: `Vendors usually reply within a day — ${available.get(step.service) ?? 0} available on your date`,
        href: `${board}?open=${step.service}#category-${step.service}`,
      };
    case "event-day":
      return { title: "Your team is booked", detail: "Plan the day with your run sheet", href: `${board}/day` };
    case "review-vendors":
      return { title: "How did it go?", detail: "Leave reviews for your vendors", href: "/dashboard/bookings" };
  }
}

export function NextStepCard({
  eventId,
  step,
  availableByService,
}: {
  eventId: string;
  step: NextStep;
  availableByService: Map<string, number>;
}) {
  const copy = stepCopy(eventId, step, availableByService);
  return (
    <Link
      href={copy.href}
      className="group mb-8 flex items-center gap-4 rounded-3xl border border-champagne/40 bg-champagne/10 p-5 outline-none transition-colors hover:bg-champagne/15 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-warning">Your next step</p>
        <p className="mt-0.5 text-lg font-semibold">{copy.title}</p>
        <p className="text-sm text-muted-foreground">{copy.detail}</p>
      </div>
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-champagne text-white transition-transform duration-200 group-hover:translate-x-0.5"
      >
        <ArrowRight className="size-5" />
      </span>
    </Link>
  );
}

export function EventSummaryCard({
  event,
  progress,
  href,
  className,
}: {
  event: Event;
  progress: { done: number; total: number; percent: number };
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-3xl border border-border bg-card p-5 outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{event.event_type}</p>
      <p className="mt-0.5 truncate text-lg font-semibold">{eventTitle(event)}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <CalendarDays className="size-3.5" aria-hidden />
          {formatEventDay(event.event_date, true)}
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {event.suburb}
        </span>
        {Number(event.budget_total) > 0 && (
          <span className="flex items-center gap-1">
            <Wallet className="size-3.5" aria-hidden />
            {aud(Number(event.budget_total))}
          </span>
        )}
      </p>
      <div className="mt-4">
        <ProgressBar percent={progress.percent} label={progressLabel(progress)} />
      </div>
    </Link>
  );
}
