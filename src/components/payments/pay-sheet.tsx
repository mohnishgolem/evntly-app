"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { CircleCheck, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { THEME_CHANGE_EVENT } from "@/components/theme-toggle";
import { payMilestone } from "@/lib/actions/payments";
import { formatAud } from "@/lib/payments/money";
import { currentSheetTheme, stripeAppearance, type SheetTheme } from "@/lib/payments/stripe-appearance";

// Stripe.js loads on the first payment, not on every page.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  stripePromise ??= loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
  return stripePromise;
}

export type PaySummary = { vendorName: string; service: string; eventDate: string };

// In-app payment: Evntly's own sheet (summary, Pay button, errors, success)
// around Stripe's Payment Element, themed to match. Card details are typed
// into Stripe's iframe, never our page, and the milestone is marked paid
// only by the Stripe webhook. Retrying after a decline, or closing and
// reopening the sheet, reuses the same Checkout Session, so a customer can
// never be charged twice for one milestone.
export function PaySheet({
  milestoneId,
  name,
  kind,
  amountCents,
  summary,
}: {
  milestoneId: string;
  name: string;
  kind: string;
  amountCents: number;
  summary: PaySummary;
}) {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amount = formatAud(amountCents);

  function open() {
    setError(null);
    startTransition(async () => {
      const res = await payMilestone(milestoneId);
      if (res?.clientSecret) setClientSecret(res.clientSecret);
      else setError(res?.error ?? "We couldn't open the payment form. Please try again.");
    });
  }

  function close() {
    setClientSecret(null);
    if (!paid) return;
    setPaid(false);
    // The webhook usually lands within a second or two of payment.
    router.refresh();
    setTimeout(() => router.refresh(), 2500);
  }

  return (
    <>
      <Button size="sm" disabled={pending} onClick={open}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
        Pay {amount}
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog open={!!clientSecret} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[92dvh] gap-5 overflow-y-auto p-5 sm:max-w-md sm:p-6">
          {paid ? (
            <PaidView amount={amount} name={name} vendorName={summary.vendorName} onDone={close} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">{kind === "deposit" ? "Pay your deposit" : `Pay for ${name}`}</DialogTitle>
                <DialogDescription>Evntly holds your payment until it&apos;s released to the vendor.</DialogDescription>
              </DialogHeader>
              <BookingSummary summary={summary} name={name} amount={amount} />
              {clientSecret && (
                <CheckoutElementsProvider
                  stripe={getStripe()}
                  options={{
                    clientSecret,
                    elementsOptions: {
                      appearance: stripeAppearance(currentSheetTheme()),
                      savedPaymentMethod: { enableSave: "auto", enableRedisplay: "auto" },
                    },
                  }}
                >
                  <PaymentForm amount={amount} onPaid={() => setPaid(true)} />
                </CheckoutElementsProvider>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BookingSummary({ summary, name, amount }: { summary: PaySummary; name: string; amount: string }) {
  const rows: [string, string][] = [
    ["Vendor", summary.vendorName],
    ["Service", summary.service],
    ["Event date", summary.eventDate],
    ["Payment", name],
    ["Booking fees", "None"],
  ];
  return (
    <dl className="rounded-2xl bg-muted px-4 py-3 text-sm ring-1 ring-border">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-1">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
      <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-border pt-3">
        <dt className="font-semibold">Total</dt>
        <dd className="text-xl font-semibold tabular-nums">{amount}</dd>
      </div>
    </dl>
  );
}

function PaymentForm({ amount, onPaid }: { amount: string; onPaid: () => void }) {
  const result = useCheckoutElements();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkout = result.type === "success" ? result.checkout : null;

  // Follow Evntly's light/dark toggle while the sheet is open.
  useEffect(() => {
    if (!checkout) return;
    function onTheme(e: Event) {
      checkout?.changeAppearance(stripeAppearance((e as CustomEvent<SheetTheme>).detail));
    }
    window.addEventListener(THEME_CHANGE_EVENT, onTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onTheme);
  }, [checkout]);

  if (result.type === "error") {
    return (
      <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
        The payment form didn&apos;t load. Close this and try again — you haven&apos;t been charged.
      </p>
    );
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!checkout || busy) return;
    setBusy(true);
    setError(null);
    // Cards and wallets finish here (3-D Secure opens in a Stripe pop-up);
    // only a bank redirect would leave the page, and it comes back here.
    const res = await checkout.confirm({ redirect: "if_required", returnUrl: window.location.href.split("?")[0] });
    setBusy(false);
    if (res.type === "success") onPaid();
    else
      setError(
        res.error.code === "paymentFailed"
          ? `${res.error.message} You haven't been charged — try again or use another card.`
          : res.error.message
      );
  }

  return (
    <form onSubmit={pay} className="space-y-4">
      {!ready && <FormSkeleton />}
      <div className={ready ? undefined : "h-0 overflow-hidden"}>
        <PaymentElement options={{ layout: "tabs" }} onReady={() => setReady(true)} />
      </div>
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={!ready || busy}>
        {busy ? (
          <>
            <Loader2 className="animate-spin" aria-hidden /> Processing…
          </>
        ) : (
          <>
            <Lock aria-hidden /> Pay {amount}
          </>
        )}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-success" aria-hidden />
        Payments are secured by Stripe. Evntly never sees your card details.
      </p>
    </form>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading payment form">
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}

function PaidView({ amount, name, vendorName, onDone }: { amount: string; name: string; vendorName: string; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-success/15 animate-in zoom-in-50 duration-300">
        <CircleCheck className="size-8 text-success" aria-hidden />
      </span>
      <DialogTitle className="text-lg">Payment received</DialogTitle>
      <DialogDescription className="max-w-xs">
        {amount} for &ldquo;{name}&rdquo; is held by Evntly and released to {vendorName} as agreed in your payment plan.
      </DialogDescription>
      <Button size="lg" className="mt-2 w-full" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
