"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acceptQuote, cancelQuote } from "@/lib/actions/quotes";

export function QuoteActions({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Blocks a double tap before the disabled state renders. Accepting moves
  // on to Bookings, which confirms it: this card disappears once the quote
  // is accepted, so a message here would never be seen.
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string } | null>, onDone: () => void) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (res?.error) setError(res.error);
        else onDone();
      } finally {
        busy.current = false;
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button size="lg" disabled={pending} onClick={() => run(() => acceptQuote(quoteId), () => router.push("/dashboard/bookings?accepted=1"))}>
        {pending ? "Booking…" : "Accept & book"}
      </Button>
      <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => cancelQuote(quoteId), () => router.refresh())}>
        Decline
      </Button>
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}

// Customer withdraws a request the vendor hasn't priced yet. Asks first:
// the vendor may already be working on a quote.
export function WithdrawRequest({ quoteId, vendorName }: { quoteId: string; vendorName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function withdraw() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await cancelQuote(quoteId);
        if (res?.error) setError(res.error);
        else router.refresh();
      } finally {
        busy.current = false;
      }
    });
  }

  if (!confirming) {
    return (
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Withdraw request
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span>Withdraw this request? We&apos;ll let {vendorName} know.</span>
      <Button variant="destructive" size="sm" disabled={pending} onClick={withdraw}>
        {pending ? "Withdrawing…" : "Withdraw"}
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
        Keep
      </Button>
      {error && <p role="alert" className="w-full text-destructive">{error}</p>}
    </div>
  );
}
