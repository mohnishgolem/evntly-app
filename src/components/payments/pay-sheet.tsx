"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { CircleCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { payMilestone } from "@/lib/actions/payments";
import { formatAud } from "@/lib/payments/money";

// Stripe.js loads on the first payment, not on every page.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  stripePromise ??= loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");
  return stripePromise;
}

// In-app payment: Stripe's form (cards, saved cards, Apple Pay, Google Pay)
// opens in a sheet on the booking page. Card details are typed into Stripe's
// iframe, never our page. The milestone is marked paid only by the Stripe
// webhook, so after the form completes we refresh until it shows.
export function PaySheet({ milestoneId, name, amountCents }: { milestoneId: string; name: string; amountCents: number }) {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setError(null);
    startTransition(async () => {
      const res = await payMilestone(milestoneId);
      if (res?.clientSecret) setClientSecret(res.clientSecret);
      else setError(res?.error ?? "We couldn't open the payment form. Please try again.");
    });
  }

  function onComplete() {
    setPaid(true);
    // The webhook usually lands within a couple of seconds.
    for (const ms of [1500, 4000, 8000]) setTimeout(() => router.refresh(), ms);
  }

  function close() {
    setClientSecret(null);
    if (paid) router.refresh();
    setPaid(false);
  }

  return (
    <>
      <Button size="sm" disabled={pending} onClick={open}>
        <Lock /> {pending ? "Opening…" : `Pay ${formatAud(amountCents)}`}
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog open={!!clientSecret} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{paid ? "Payment received" : `Pay ${formatAud(amountCents)}`}</DialogTitle>
            <DialogDescription>
              {paid
                ? `Thanks — ${formatAud(amountCents)} for "${name}" is held by Evntly until it's released to the vendor.`
                : `${name}. Held by Evntly until it's released to the vendor.`}
            </DialogDescription>
          </DialogHeader>
          {paid ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CircleCheck className="size-10 text-emerald-600" aria-hidden />
              <Button onClick={close}>Done</Button>
            </div>
          ) : (
            clientSecret && (
              <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret, onComplete }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
