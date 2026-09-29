"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acceptQuote, cancelQuote } from "@/lib/actions/quotes";

export function QuoteActions({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptQuote(quoteId);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function decline() {
    setError(null);
    startTransition(async () => {
      const res = await cancelQuote(quoteId);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 flex gap-2">
      <Button size="sm" disabled={pending} onClick={accept}>
        Accept & book
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={decline}>
        Decline
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
