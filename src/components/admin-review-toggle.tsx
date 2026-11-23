"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setReviewHidden } from "@/lib/actions/reviews";

/** Hide a past-client review (with a reason), or restore it. */
export function AdminReviewToggle({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function run(nextHidden: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await setReviewHidden(reviewId, nextHidden, reason);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 sm:w-52">
      {!hidden && (
        <input
          aria-label="Reason for hiding (optional)"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm"
        />
      )}
      <Button variant={hidden ? "outline" : "destructive"} className="min-h-11" disabled={pending} onClick={() => run(!hidden)}>
        {pending ? "Saving…" : hidden ? "Restore review" : "Hide review"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
