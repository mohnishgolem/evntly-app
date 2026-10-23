"use client";

import { useState, useTransition } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setAcceptingBookings } from "@/lib/actions/availability";

// Pause stops new quote requests (the fill_quote_request_vendor trigger
// refuses them) without taking the listing down; Resume reopens it.
export function ListingPauseToggle({ listingId, accepting }: { listingId: string; accepting: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 gap-1.5 sm:min-h-9"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await setAcceptingBookings(listingId, !accepting);
            if (res?.error) setError(res.error);
          })
        }
      >
        {accepting ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        {pending ? "Saving…" : accepting ? "Pause new requests" : "Resume requests"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
