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
