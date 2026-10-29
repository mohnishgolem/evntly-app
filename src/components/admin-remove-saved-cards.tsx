"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminRemoveSavedCards } from "@/lib/actions/payments";

// Account deletion step: deletes the customer's Stripe record and saved
// cards. Payment history is kept (Stripe and Evntly's payment records).
export function AdminRemoveSavedCards({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <Button
        size="xs"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await adminRemoveSavedCards(requestId);
            setMessage(res?.error ? { ok: false, text: res.error } : { ok: true, text: "Done — noted on the request." });
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />} Remove saved cards
      </Button>
      {message && (
        <span role="status" className={message.ok ? "text-muted-foreground" : "text-destructive"}>
          {message.text}
        </span>
      )}
    </span>
  );
}
