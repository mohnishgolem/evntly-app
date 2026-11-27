"use client";

import { earliestEventDate } from "@/lib/event-dates";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarCheck, CheckCircle2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSheetSide } from "@/lib/use-sheet-side";
import { requestQuote, type QuoteRequestDraft } from "@/lib/actions/quotes";
import { BOOK_INTENT_COOKIE, bookIntentPath } from "@/lib/booking-intent";
import { EVENT_TYPES } from "@/lib/config";
import { stickyBarOffset } from "@/lib/sticky-bar";
import { cn } from "@/lib/utils";
import type { ShareSource } from "@/lib/share-profile";

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

// Fixed English names, not toLocaleDateString: Node and Safari ship different
// ICU data, and this text is server-rendered in a client component, so any
// difference is a React hydration error (#418).
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 15 Nov 2026" for a "YYYY-MM-DD" calendar day, identical everywhere. */
export function formatEventDate(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return date;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]} ${y}`;
}

// A guest's unsent quote details, kept in this browser while they sign up.
// Only the event details the form asks for; dropped after a day or once sent.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const draftKey = (vendorId: string) => `evntly_quote_draft:${vendorId}`;
function saveQuoteDraft(vendorId: string, draft: QuoteRequestDraft) {
  try {
    localStorage.setItem(draftKey(vendorId), JSON.stringify({ at: Date.now(), draft }));
  } catch {
    // Private mode: they'll fill the form in again after signing up.
  }
}
export function readQuoteDraft(vendorId: string): QuoteRequestDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(vendorId));
    if (!raw) return null;
    const { at, draft } = JSON.parse(raw) as { at: number; draft: QuoteRequestDraft };
    if (Date.now() - at > DRAFT_TTL_MS || !draft?.eventDate) return null;
    return draft;
  } catch {
    return null;
  }
}
function clearQuoteDraft(vendorId: string) {
  try {
    localStorage.removeItem(draftKey(vendorId));
  } catch {
    // Nothing to clear.
  }
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
 * The "Request a quote" call to action on a vendor profile: a button in the
 * sidebar card, plus a sticky bar on phones (where the card sits below the
 * whole profile). Guests see the profile and fill in the form first; only
 * sending needs an account, and sign-up brings them straight back with the
 * form open on their saved details (?book=1).
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
  shareSource,
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
  /** The vendor's Share profile tag this visit came with (?src=share_*). */
  shareSource?: ShareSource | null;
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

  const side = useSheetSide();
  const [open, setOpen] = useState(() => !!autoOpen && state.kind === "bookable");
  // Back from sign-up the form reopens once (?book=1 / the book intent
  // cookie). Returning through the email link's "Continue" (/auth/confirm),
  // the page first renders as a guest and then again signed in, so remember
  // the intent across renders and open when the signed-in one arrives.
  const wantsOpen = useRef(false);
  const autoOpened = useRef(open);
  useEffect(() => {
    if (autoOpen) wantsOpen.current = true;
    if (wantsOpen.current && state.kind === "bookable" && !autoOpened.current) {
      autoOpened.current = true;
      setOpen(true);
    }
  }, [autoOpen, state.kind]);

  // The booking intent is one-shot: clear its cookie once the form has
  // opened, so a refresh or Back doesn't pop it open again. (Clearing it on a
  // guest render lost the intent before the signed-in render; PR #82 QA.)
  useEffect(() => {
    if (open && autoOpen) document.cookie = `${BOOK_INTENT_COOKIE}=; Max-Age=0; Path=${bookIntentPath(vendorId)}`;
  }, [open, autoOpen, vendorId]);

  // Keeps the Share profile tag through sign-up, so the request is credited
  // even when sign-up ends in a different browser (e.g. the email's link).
  const bookPath = `/vendor/${vendorId}?book=1${shareSource ? `&src=${shareSource}` : ""}`;
  const signupHref = `/signup?next=${encodeURIComponent(bookPath)}`;

  function primary(className?: string) {
    switch (state.kind) {
      case "sample":
        return (
          <Button size="lg" className={className} disabled>
            <CalendarCheck /> Request a quote
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
      case "bookable":
        return (
          <Button size="lg" className={className} onClick={() => setOpen(true)}>
            <CalendarCheck /> Request a quote
          </Button>
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
    }
  }

  return (
    <>
      <div className="space-y-3">
        {primary("w-full")}
        <StateNote state={state} vendorName={vendorName} onBookAnother={() => setOpen(true)} />
        {state.kind !== "sample" && state.kind !== "own" && (
          <details className="group surface-pressed rounded-2xl px-4 py-2.5 text-sm">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              How booking works <span className="text-muted-foreground group-open:hidden">›</span>
            </summary>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-foreground/75">
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
          // m-0: the vendor page wraps this in space-y-2, whose 8px margin
          // lifted the fixed bar off the tab bar and left a see-through gap.
          "glass-material fixed inset-x-0 z-30 m-0 border-t border-border/60 px-4 py-3 md:hidden print:hidden",
          stickyBarOffset(hasTabBar)
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

      {(state.kind === "bookable" || state.kind === "open" || state.kind === "guest") && (
        <Sheet open={open} onOpenChange={setOpen}>
          {/* Phones: a bottom sheet that rides above the keyboard; wider
              screens: a side panel, so the profile stays in view. */}
          <SheetContent side={side} className="gap-4 overflow-y-auto pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-md sm:px-6 sm:pt-6">
            {side === "bottom" && <div aria-hidden className="mx-auto mt-1 h-1.5 w-10 shrink-0 rounded-full bg-border" />}
            <BookingFlow
              vendorId={vendorId}
              vendorName={vendorName}
              eventId={eventId}
              availability={availability}
              paymentsEnabled={paymentsEnabled}
              guestSignupHref={state.kind === "guest" ? signupHref : undefined}
              onClose={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
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
              ? `${vendorName} has sent you a quote for ${formatEventDate(state.request.eventDate)}.`
              : `You've asked ${vendorName} about ${formatEventDate(state.request.eventDate)} — they'll reply with a quote.`}
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
const BUDGET_SUGGESTIONS = ["Under $500", "$500–1,000", "$1,000–2,500", "$2,500–5,000", "$5,000+"];

function StepDots({ step }: { step: 0 | 1 | 2 }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Booking steps">
      {STEP_LABELS.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined}>
          <span className={cn("block h-1.5 rounded-full", i <= step ? "[background:var(--gradient-coral)]" : "surface-pressed")} />
          <span className={cn("mt-1.5 block text-xs font-medium", i <= step ? "text-foreground" : "text-muted-foreground")}>
            <span className="sr-only">Step {i + 1}: </span>
            {label}
          </span>
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
  guestSignupHref,
  onClose,
}: {
  vendorId: string;
  vendorName: string;
  eventId?: string;
  availability?: VendorAvailability;
  paymentsEnabled: boolean;
  /** Signed out: sending saves the draft and goes to sign-up, which returns here. */
  guestSignupHref?: string;
  onClose: () => void;
}) {
  const [today] = useState(() => earliestEventDate());
  const [pending, startTransition] = useTransition();
  // Disabled-while-pending only applies after a re-render; a fast double tap
  // can land before it. The ref blocks the second submit synchronously.
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Details a guest filled in before signing up come back with them, already
  // on the review step, so sending is one tap (this browser only).
  const [restored] = useState(() => (guestSignupHref ? null : readQuoteDraft(vendorId)));
  const [step, setStep] = useState<0 | 1 | 2>(restored ? 1 : 0);
  const [draft, setDraft] = useState<QuoteRequestDraft>(
    () =>
      restored ?? {
        eventDate: "",
        eventType: EVENT_TYPES[0],
        location: "",
        estimatedGuests: 0,
        estimatedHours: undefined,
        budgetRange: "",
        details: "",
      }
  );

  function continueAsGuest() {
    if (!guestSignupHref) return;
    saveQuoteDraft(vendorId, draft);
    window.location.assign(guestSignupHref);
  }

  function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await requestQuote(vendorId, draft, eventId);
        if (res?.error) setError(res.error);
        else {
          clearQuoteDraft(vendorId);
          setStep(2);
        }
      } catch {
        setError("Something went wrong sending your request. Check your connection and try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  const header = (
    <SheetHeader className="gap-3 px-0">
      <SheetTitle className="pr-10 text-headline">{step === 2 ? "Request sent" : `Request a quote from ${vendorName}`}</SheetTitle>
      <SheetDescription className="sr-only">Send your event details to {vendorName} for a quote.</SheetDescription>
      <StepDots step={step} />
    </SheetHeader>
  );

  if (step === 2) {
    return (
      <>
        {header}
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="btn-raised mb-1 flex size-16 items-center justify-center rounded-full">
            <CheckCircle2 className="size-9 text-success-text" aria-hidden />
          </span>
          <p className="font-medium">Your request is with {vendorName}</p>
          <p className="text-sm text-muted-foreground">
            We&apos;ve let them know. You&apos;ll get an email when they reply with a quote — then accept it to book.
            You haven&apos;t been charged anything.
          </p>
          <div className="mt-3 grid w-full gap-2">
            <Button size="lg" nativeButton={false} render={<Link href="/dashboard/quotes">Track it in Bookings</Link>} />
            <Button size="lg" variant="raised" onClick={onClose}>
              Back to {vendorName}
            </Button>
          </div>
        </div>
      </>
    );
  }

  if (step === 1) {
    const rows: [string, string][] = [
      ["Date", formatEventDate(draft.eventDate)],
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
        <dl className="surface-raised divide-y divide-border rounded-2xl text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-3 px-4 py-2.5">
              <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1 break-words whitespace-pre-line">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="surface-pressed rounded-2xl px-4 py-3 text-sm">
          <p className="font-medium">What happens next</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-foreground/75">
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
          {guestSignupHref ? (
            <>
              <Button size="lg" onClick={continueAsGuest}>
                Create free account to send
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                We&apos;ll keep these details. After you verify your email you come straight back here to send them.
              </p>
            </>
          ) : (
            <Button size="lg" disabled={pending} onClick={submit}>
              {pending ? "Sending…" : "Send quote request"}
            </Button>
          )}
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
  const missing = [
    !draft.eventDate && "date",
    !draft.location.trim() && "location",
    !(draft.estimatedGuests > 0) && "guest count",
    !draft.budgetRange.trim() && "budget",
  ].filter(Boolean) as string[];

  return (
    <>
      {header}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="qr-date">Event date</Label>
            <Input
              id="qr-date"
            className="h-11 rounded-xl sm:h-10"
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
              className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-10 sm:text-sm"
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
            className="h-11 rounded-xl sm:h-10"
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
            className="h-11 rounded-xl sm:h-10"
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
            className="h-11 rounded-xl sm:h-10"
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
            className="h-11 rounded-xl sm:h-10"
            placeholder="e.g. $500–1,000"
            value={draft.budgetRange}
            onChange={(e) => setDraft((d) => ({ ...d, budgetRange: e.target.value }))}
          />
          {/* One tap fills the same free-text field (no new data format). */}
          <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Budget suggestions">
            {BUDGET_SUGGESTIONS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={draft.budgetRange === b}
                onClick={() => setDraft((d) => ({ ...d, budgetRange: b }))}
                className={cn("h-8 rounded-full px-3 text-[13px] font-medium", draft.budgetRange === b ? "surface-pressed ring-1 ring-primary/40" : "btn-raised")}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qr-details">Anything else they should know? (optional)</Label>
          <Textarea
            id="qr-details"
            className="rounded-xl"
            rows={3}
            value={draft.details}
            onChange={(e) => setDraft((d) => ({ ...d, details: e.target.value }))}
          />
        </div>

        <Button size="lg" className="w-full" disabled={!canContinue} onClick={() => setStep(1)}>
          Review request
        </Button>
        {!canContinue && !unavailable && (
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Still needed: {missing.join(", ")}.
          </p>
        )}
      </div>
    </>
  );
}
