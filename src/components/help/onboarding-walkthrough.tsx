"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import {
  CalendarCheck,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Inbox,
  MessageCircle,
  PartyPopper,
  Sparkles,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveOnboardingStatus } from "@/lib/actions/onboarding";
import { isQuietPath, type OnboardingStatus } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

export const REPLAY_ONBOARDING_EVENT = "evntly:replay-onboarding";

// Remembered on this device too, so the walkthrough stays closed even
// before the refreshed session reaches the server. Keyed by account, so
// one person dismissing it doesn't hide it from someone else who signs in
// on the same device.
const localKey = (userId: string) => `evntly-onboarding-v1:${userId}`;

type Step = { icon: LucideIcon; title: string; body: string; link?: { label: string; href: string } };

function customerSteps(paymentsEnabled: boolean): Step[] {
  return [
    {
      icon: PartyPopper,
      title: "Welcome to Evntly",
      body: "Find trusted Sydney event vendors, compare their quotes and keep every booking in one place. Here's how it works — it takes under a minute.",
    },
    {
      icon: Sparkles,
      title: "Plan your event",
      body: "Start Planning sets up an event board in My Events. It shows the services you still need and vendors that match.",
      link: { label: "Start planning", href: "/plan" },
    },
    {
      icon: FileText,
      title: "Request quotes",
      body: "Ask vendors for a price from their listing or your event board. Requests expire after 7 days, so vendors reply quickly.",
      link: { label: "Explore vendors", href: "/explore" },
    },
    {
      icon: CalendarCheck,
      title: "Accept, then the vendor confirms",
      body: "Accepting a quote creates a Pending booking. It's Confirmed once the vendor locks in your date. Find it all under Bookings.",
      link: { label: "Requests & quotes", href: "/dashboard/quotes" },
    },
    {
      icon: MessageCircle,
      title: "Message vendors",
      body: "Chat with vendors in Messages. Phone numbers and emails stay hidden until you have a booking together.",
    },
    {
      icon: Wallet,
      title: "Paying for your booking",
      body: paymentsEnabled
        ? "Follow the Payments section on each booking. Read the deposit and cancellation terms on a quote before you accept."
        : "You pay the vendor directly, on the terms in their quote. Evntly doesn't charge you any fee. Check deposit and cancellation terms before you accept.",
    },
    {
      icon: CircleHelp,
      title: "Help is always here",
      body: "Open Help & Guides from the menu any time — including to replay this walkthrough.",
      link: { label: "Help & Guides", href: "/help" },
    },
  ];
}

function vendorSteps(paymentsEnabled: boolean): Step[] {
  return [
    {
      icon: PartyPopper,
      title: "Welcome to Evntly",
      body: "Get leads from people planning events, send quotes and manage your bookings from one dashboard. Here's the quick tour.",
    },
    {
      icon: Store,
      title: "Your listing",
      body: "Add your services, prices, photos and service area. Evntly reviews new listings, usually within 24–48 hours.",
      link: { label: "Your listings", href: "/vendor-dashboard/business" },
    },
    {
      icon: Inbox,
      title: "Reply to leads",
      body: "Requests arrive in Leads. Send an itemised quote with your deposit and cancellation terms, or decline. Requests expire after 7 days.",
      link: { label: "Leads", href: "/vendor-dashboard/enquiries" },
    },
    {
      icon: CalendarCheck,
      title: "Confirm bookings",
      body: "When a customer accepts your quote, confirm the booking to lock in the date. It then shows on your calendar.",
      link: { label: "Bookings", href: "/vendor-dashboard/bookings" },
    },
    {
      icon: ClipboardCheck,
      title: "On the day",
      body: "Mark the job done on the job card from the event date. The booking completes when your customer confirms.",
    },
    {
      icon: Wallet,
      title: "Getting paid",
      body: paymentsEnabled
        ? "Follow the Payments section on each booking. Put your deposit and cancellation terms in every quote."
        : "Customers pay you directly, on the terms in your quote. Listing on Evntly is currently free — no commission or booking fees.",
    },
    {
      icon: CircleHelp,
      title: "Help is always here",
      body: "Open Help & Guides from the menu any time — including to replay this walkthrough.",
      link: { label: "Help & Guides", href: "/help" },
    },
  ];
}

function readLocal(userId: string) {
  try {
    return window.localStorage.getItem(localKey(userId));
  } catch {
    return null;
  }
}

function writeLocal(userId: string, value: OnboardingStatus) {
  try {
    window.localStorage.setItem(localKey(userId), value);
  } catch {
    // Private mode etc. — the account copy still saves.
  }
}

// The first-time walkthrough: a short, skippable sheet of steps. It opens
// on its own only for new accounts that haven't finished or skipped it
// (decided on the server — see OnboardingGate), and from "Replay
// walkthrough" in Help & Guides for anyone.
export function OnboardingWalkthrough({
  userId,
  role,
  autoStart,
  paymentsEnabled: initialPaymentsEnabled,
}: {
  userId: string;
  role: "customer" | "vendor";
  autoStart: boolean;
  paymentsEnabled: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [paymentsEnabled, setPaymentsEnabled] = useState(initialPaymentsEnabled);
  // Opened from a button (Replay) rather than a Dialog.Trigger, so hand
  // focus back to that button on close ourselves.
  const returnFocus = useRef<HTMLElement | null>(null);
  const steps = role === "vendor" ? vendorSteps(paymentsEnabled) : customerSteps(paymentsEnabled);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    if (autoStart && !readLocal(userId) && !isQuietPath(window.location.pathname)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    }
    const replay = (e: Event) => {
      const detail = (e as CustomEvent<{ paymentsEnabled?: boolean }>).detail;
      if (typeof detail?.paymentsEnabled === "boolean") setPaymentsEnabled(detail.paymentsEnabled);
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_ONBOARDING_EVENT, replay);
    return () => window.removeEventListener(REPLAY_ONBOARDING_EVENT, replay);
    // Auto-start is decided once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Following a "Show me" link closes the walkthrough (see finish below);
  // any other navigation leaves it open where it was.
  useEffect(() => {
    if (open && isQuietPath(pathname)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function finish(status: OnboardingStatus) {
    setOpen(false);
    writeLocal(userId, status);
    // Fire and forget: failing to save only means it may open once more.
    saveOnboardingStatus(status).catch(() => {});
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Escape or tapping outside counts as skipping (or finishing, on
        // the last step).
        if (!next) finish(last ? "completed" : "skipped");
        else setOpen(true);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen && returnFocus.current?.isConnected) returnFocus.current.focus();
        if (!isOpen) returnFocus.current = null;
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-[70] bg-black/45 backdrop-blur-[6px]",
            "transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
        />
        <Dialog.Popup
          aria-describedby="onboarding-body"
          className={cn(
            "fixed z-[70] flex flex-col bg-popover text-popover-foreground shadow-2xl shadow-black/30 outline-none",
            // Phones: a bottom sheet clear of the home indicator. Larger
            // screens: a centred card.
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[28px] px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[28rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:p-8",
            "ring-1 ring-foreground/10 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            "data-ending-style:translate-y-6 data-ending-style:opacity-0 data-starting-style:translate-y-6 data-starting-style:opacity-0",
          )}
        >
          <span aria-hidden className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-foreground/15 sm:hidden" />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground tabular-nums" aria-live="polite">
              Step {index + 1} of {steps.length}
            </p>
            {!last && (
              <button
                type="button"
                onClick={() => finish("skipped")}
                className="-mr-2 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                Skip
              </button>
            )}
          </div>

          {/* Progress: one segment per step. */}
          <div
            role="progressbar"
            aria-label="Walkthrough progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={index + 1}
            className="mt-2 flex gap-1.5"
          >
            {steps.map((s, i) => (
              <span
                key={s.title}
                className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i <= index ? "bg-primary" : "bg-foreground/10")}
              />
            ))}
          </div>

          <div className="mt-7 flex flex-col items-center text-center sm:mt-8">
            <span className="flex size-16 items-center justify-center rounded-[20px] bg-highlight-light text-primary">
              <step.icon className="size-8" strokeWidth={1.75} aria-hidden />
            </span>
            <Dialog.Title className="mt-5 text-[22px] leading-tight font-bold tracking-tight">{step.title}</Dialog.Title>
            <p id="onboarding-body" className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
              {step.body}
            </p>
            {step.link && (
              <Link
                href={step.link.href}
                onClick={() => finish(last ? "completed" : "skipped")}
                className="mt-3 inline-flex min-h-11 items-center text-[15px] font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
              >
                {step.link.label}
              </Link>
            )}
          </div>

          <div className="mt-6 flex gap-2 sm:mt-8">
            {index > 0 && (
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setIndex((i) => i - 1)}>
                Back
              </Button>
            )}
            <Button
              size="lg"
              className="flex-1"
              autoFocus
              onClick={() => (last ? finish("completed") : setIndex((i) => i + 1))}
            >
              {last ? "Get started" : index === 0 ? "Show me" : "Next"}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
