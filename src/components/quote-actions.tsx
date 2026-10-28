"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptQuote, cancelQuote } from "@/lib/actions/quotes";

export function QuoteActions({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Blocks a double tap before the disabled state renders.
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

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

  if (accepted) {
    return (
      <div role="status" className="mt-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="size-4 text-success" aria-hidden /> Quote accepted — your booking request is in
        </p>
        <p className="mt-1 text-muted-foreground">
          The vendor now confirms the booking. We&apos;ll email you as soon as they do.
        </p>
        <Link href="/dashboard/bookings" className="mt-2 inline-block font-medium underline underline-offset-2">
          View your bookings
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button size="lg" disabled={pending} onClick={() => run(() => acceptQuote(quoteId), () => setAccepted(true))}>
        {pending ? "Booking…" : "Accept & book"}
      </Button>
      <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => cancelQuote(quoteId), () => router.refresh())}>
        Decline
      </Button>
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}
