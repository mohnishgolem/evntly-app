"use client";

import { earliestEventDate } from "@/lib/event-dates";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarCheck, CheckCircle2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestQuote, type QuoteRequestDraft } from "@/lib/actions/quotes";
import { EVENT_TYPES } from "@/lib/config";
import { cn } from "@/lib/utils";

// Mirrors the vendor's calendar settings so the form can warn before
// submitting; fill_quote_request_vendor enforces the same rules in the DB.
export type VendorAvailability = {
  accepting: boolean;
  unavailableDates: string[];
  /** 0 = Sunday … 6 = Saturday */
  weeklyDaysOff: number[];
};

/** The signed-in customer's open (pending/quoted) request to this vendor. */
export type OpenRequest = { id: string; status: string; eventDate: string };

function dateProblem(date: string, vendorName: string, availability?: VendorAvailability) {
  if (!date || !availability) return null;
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (availability.unavailableDates.includes(date) || availability.weeklyDaysOff.includes(dow)) {
    return `${vendorName} isn't available on that date — try another day.`;
  }
  return null;
}

function formatDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Booking on Evntly goes through a quote: the customer sends their event
// details, the vendor replies with a price, and accepting that quote creates
// the booking (accept_quote), which the vendor then confirms.
export const BOOKING_STEPS = [
  "Send your event details — it's free and you don't pay anything yet.",
  "The vendor replies with a quote. Message them with any questions.",
  "Accept the quote to book. The vendor confirms and your date is locked in.",
];

type BookState =
  | { kind: "sample" }
  | { kind: "own" }
  | { kind: "unavailable" }
  | { kind: "guest" }
  | { kind: "open"; request: OpenRequest }
  | { kind: "bookable" };

/**
 * The "Book this vendor" call to action on a vendor profile: a button in the
 * sidebar card, plus a sticky bar on phones (where the card sits below the
 * whole profile). Guests go to sign-up and come straight back with the
 * booking form open (?book=1).
 */
export function BookVendor({
  isAuthenticated,
  isOwnListing,
  isSample,
  vendorId,
  vendorName,
  eventId,
  availability,
  openRequest,
  autoOpen,
  priceLabel,
  paymentsEnabled,
  hasTabBar,
}: {
  isAuthenticated: boolean;
  isOwnListing: boolean;
  isSample: boolean;
  vendorId: string;
  vendorName: string;
  eventId?: string;
  availability?: VendorAvailability;
  openRequest?: OpenRequest | null;
  autoOpen?: boolean;
  priceLabel?: string | null;
  paymentsEnabled: boolean;
  /** Signed-in phones show the app's bottom tab bar; sit the sticky bar above it. */
  hasTabBar: boolean;
}) {
  const state: BookState = isSample
    ? { kind: "sample" }
    : isOwnListing
      ? { kind: "own" }
      : availability && !availability.accepting
        ? { kind: "unavailable" }
        : !isAuthenticated
          ? { kind: "guest" }
          : openRequest
            ? { kind: "open", request: openRequest }
            : { kind: "bookable" };

  const [open, setOpen] = useState(() => !!autoOpen && state.kind === "bookable");

  // ?book=1 is a one-shot intent from the sign-up round trip: drop it so a
  // refresh or Back doesn't pop the form open again. Through the router —
  // a bare history.replaceState is undone when a server action re-renders.
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (autoOpen) router.replace(pathname, { scroll: false });
  }, [autoOpen, pathname, router]);

  const bookPath = `/vendor/${vendorId}?book=1`;
  const signupHref = `/signup?next=${encodeURIComponent(bookPath)}`;

  function primary(className?: string) {
    switch (state.kind) {
      case "sample":
        return (
          <Button size="lg" className={className} disabled>
            <CalendarCheck /> Book this vendor
          </Button>
        );
      case "own":
        return (
          <Button
            size="lg"
            variant="outline"
            className={className}
            nativeButton={false}
            render={<Link href="/vendor-dashboard/business">Edit your listing</Link>}
          />
        );
      case "unavailable":
        return (
          <Button size="lg" variant="outline" className={className} disabled>
            Not taking new bookings
          </Button>
        );
      case "guest":
        return (
          <Button
            size="lg"
            className={className}
            nativeButton={false}
            render={
              <Link href={signupHref}>
                <CalendarCheck /> Book this vendor
              </Link>
            }
          />
        );
      case "open":
        return (
          <Button
            size="lg"
            className={className}
            nativeButton={false}
            render={<Link href="/dashboard/quotes">{state.request.status === "quoted" ? "Review their quote" : "View your request"}</Link>}
          />
        );
      case "bookable":
        return (
          <Button size="lg" className={className} onClick={() => setOpen(true)}>
            <CalendarCheck /> Book this vendor
          </Button>
        );
    }
  }

  return (
    <>
      <div className="space-y-3">
        {primary("w-full")}
        <StateNote state={state} vendorName={vendorName} onBookAnother={() => setOpen(true)} />
        {state.kind !== "sample" && state.kind !== "own" && (
          <details className="group rounded-xl bg-secondary/60 px-3 py-2 text-sm">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              How booking works <span className="text-muted-foreground group-open:hidden">›</span>
            </summary>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
              {BOOKING_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </details>
        )}
      </div>

      {/* Phones: the booking card is below the whole profile, so keep the
          action in reach. Sits above the tab bar when there is one. */}
      <div aria-hidden className="h-20 md:hidden print:hidden" />
      <div
        className={cn(
          "glass-material fixed inset-x-0 z-30 border-t border-border/60 px-4 py-3 md:hidden print:hidden",
          hasTabBar
            ? "bottom-[calc(3.5rem+max(0.5rem,env(safe-area-inset-bottom)))]"
            : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        )}
      >
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{vendorName}</p>
            {priceLabel && <p className="truncate text-xs text-muted-foreground">{priceLabel}</p>}
          </div>
          {primary("shrink-0")}
        </div>
      </div>

      {(state.kind === "bookable" || state.kind === "open") && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
            <BookingFlow
              vendorId={vendorId}
              vendorName={vendorName}
              eventId={eventId}
              availability={availability}
              paymentsEnabled={paymentsEnabled}
              onClose={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function StateNote({
  state,
  vendorName,
  onBookAnother,
}: {
  state: BookState;
  vendorName: string;
  onBookAnother: () => void;
}) {
  switch (state.kind) {
    case "sample":
      return (
        <p className="text-sm text-muted-foreground">
          This is a sample listing, not a real business, so it can&apos;t be booked.{" "}
          <Link href="/explore" className="font-medium text-foreground underline underline-offset-2">
            Browse real vendors
          </Link>
        </p>
      );
    case "own":
      return <p className="text-sm text-muted-foreground">This is your listing — this is how customers see it.</p>;
    case "unavailable":
      return (
        <p className="text-sm text-muted-foreground">
          {vendorName} has paused new bookings. Save them to check back later.
        </p>
      );
    case "guest":
      return (
        <p className="text-center text-xs text-muted-foreground">
          Free to request. Create an account or log in and you&apos;ll come straight back here.
        </p>
      );
    case "open":
      return (
        <div className="text-sm text-muted-foreground">
          <p>
            {state.request.status === "quoted"
              ? `${vendorName} has sent you a quote for ${formatDate(state.request.eventDate)}.`
              : `You've asked ${vendorName} about ${formatDate(state.request.eventDate)} — they'll reply with a quote.`}
          </p>
          <button type="button" onClick={onBookAnother} className="mt-1 font-medium text-foreground underline underline-offset-2">
            Book a different date
          </button>
        </div>
      );
    case "bookable":
      return <p className="text-center text-xs text-muted-foreground">Free to request — you won&apos;t be charged.</p>;
  }
}

const STEP_LABELS = ["Details", "Review", "Sent"] as const;

function StepDots({ step }: { step: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Booking steps">
      {STEP_LABELS.map((label, i) => (
        <li
          key={label}
          aria-current={i === step ? "step" : undefined}
          className={cn("flex items-center gap-1.5", i <= step ? "text-foreground" : "text-muted-foreground")}
        >
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
              i <= step ? "bg-primary text-primary-foreground" : "bg-secondary"
            )}
          >
            {i + 1}
          </span>
          {label}
          {i < STEP_LABELS.length - 1 && <span className="mx-1 h-px w-4 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function BookingFlow({
  vendorId,
  vendorName,
  eventId,
  availability,
  paymentsEnabled,
  onClose,
}: {
  vendorId: string;
  vendorName: string;
  eventId?: string;
  availability?: VendorAvailability;
  paymentsEnabled: boolean;
  onClose: () => void;
}) {
  const [today] = useState(() => earliestEventDate());
  const [pending, startTransition] = useTransition();
  // Disabled-while-pending only applies after a re-render; a fast double tap
  // can land before it. The ref blocks the second submit synchronously.
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [draft, setDraft] = useState<QuoteRequestDraft>({
    eventDate: "",
    eventType: EVENT_TYPES[0],
    location: "",
    estimatedGuests: 0,
    estimatedHours: undefined,
    budgetRange: "",
    details: "",
  });

  function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await requestQuote(vendorId, draft, eventId);
        if (res?.error) setError(res.error);
        else setStep(2);
      } catch {
        setError("Something went wrong sending your request. Check your connection and try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  const header = (
    <DialogHeader>
      <DialogTitle>{step === 2 ? "Request sent" : `Book ${vendorName}`}</DialogTitle>
      <DialogDescription className="sr-only">Send your event details to {vendorName} for a quote.</DialogDescription>
      <StepDots step={step} />
    </DialogHeader>
  );

  if (step === 2) {
    return (
      <>
        {header}
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-9 w-9 text-success" />
          <p className="font-medium">Your request is with {vendorName}</p>
          <p className="text-sm text-muted-foreground">
            We&apos;ve let them know. You&apos;ll get an email when they reply with a quote — then accept it to book.
            You haven&apos;t been charged anything.
          </p>
          <div className="mt-3 grid w-full gap-2">
            <Button nativeButton={false} render={<Link href="/dashboard/quotes">Track it in Bookings</Link>} />
            <Button variant="outline" onClick={onClose}>
              Back to {vendorName}
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (step === 1) {
    const rows: [string, string][] = [
      ["Date", formatDate(draft.eventDate)],
      ["Event", draft.eventType],
      ["Location", draft.location],
      ["Guests", String(draft.estimatedGuests)],
      ...(draft.estimatedHours ? ([["Duration", `${draft.estimatedHours} hrs`]] as [string, string][]) : []),
      ["Budget", draft.budgetRange],
      ...(draft.details ? ([["Details", draft.details]] as [string, string][]) : []),
    ];
    return (
      <>
        {header}
        <dl className="divide-y divide-border rounded-xl border border-border text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-3 px-3 py-2">
              <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1 break-words whitespace-pre-line">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-xl bg-secondary/60 px-3 py-2.5 text-sm">
          <p className="font-medium">What happens next</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
            <li>{vendorName} replies with a price. Nothing is booked yet.</li>
            <li>If you&apos;re happy, accept the quote to book; they then confirm.</li>
            <li>
              {paymentsEnabled
                ? "Payment terms are in the quote — the booking page shows how to pay."
                : "You pay the vendor directly, on the terms in their quote. Evntly doesn't charge you a fee."}
            </li>
          </ul>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-2">
          <Button disabled={pending} onClick={submit}>
            {pending ? "Sending…" : "Send booking request"}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setStep(0)}>
            <ChevronLeft /> Edit details
          </Button>
        </div>
      </>
    );
  }

  const unavailable = dateProblem(draft.eventDate, vendorName, availability);
  const canContinue =
    !!draft.eventDate &&
    !unavailable &&
    !!draft.location.trim() &&
    draft.estimatedGuests > 0 &&
    !!draft.budgetRange.trim();

  return (
    <>
      {header}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qr-date">Event date</Label>
            <Input
              id="qr-date"
              type="date"
              min={today}
              value={draft.eventDate}
              aria-invalid={!!unavailable}
              aria-describedby={unavailable ? "qr-date-problem" : undefined}
              onChange={(e) => setDraft((d) => ({ ...d, eventDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qr-type">Event type</Label>
            <select
              id="qr-type"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={draft.eventType}
              onChange={(e) => setDraft((d) => ({ ...d, eventType: e.target.value }))}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        {unavailable && (
          <p id="qr-date-problem" className="-mt-1 text-sm text-destructive">
            {unavailable}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="qr-location">Location</Label>
          <Input
            id="qr-location"
            placeholder="e.g. Bondi, Sydney"
            value={draft.location}
            onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qr-guests">Guest count</Label>
            <Input
              id="qr-guests"
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.estimatedGuests || ""}
              onChange={(e) => setDraft((d) => ({ ...d, estimatedGuests: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qr-hours">Hours (optional)</Label>
            <Input
              id="qr-hours"
              type="number"
              inputMode="decimal"
              min={1}
              value={draft.estimatedHours ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  estimatedHours: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qr-budget">Budget</Label>
          <Input
            id="qr-budget"
            placeholder="e.g. $500–1,000"
            value={draft.budgetRange}
            onChange={(e) => setDraft((d) => ({ ...d, budgetRange: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qr-details">Anything else they should know? (optional)</Label>
          <Textarea
            id="qr-details"
            rows={3}
            value={draft.details}
            onChange={(e) => setDraft((d) => ({ ...d, details: e.target.value }))}
          />
        </div>

        <Button className="w-full" disabled={!canContinue} onClick={() => setStep(1)}>
          Review request
        </Button>
        {!canContinue && !unavailable && (
          <p className="text-center text-xs text-muted-foreground">Add a date, location, guest count and budget to continue.</p>
        )}
      </div>
    </>
  );
}
