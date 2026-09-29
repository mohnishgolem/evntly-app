"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { respondToQuote } from "@/lib/actions/quotes";

export function VendorQuoteResponse({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(action: "quote" | "decline") {
    setError(null);
    startTransition(async () => {
      const res = await respondToQuote(
        quoteId,
        action,
        action === "quote" ? Number(amount) : null,
        note
      );
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-secondary p-3">
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          placeholder="Your price ($)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32"
        />
        <Button size="sm" disabled={pending || !amount} onClick={() => respond("quote")}>
          Send quote
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => respond("decline")}>
          Decline
        </Button>
      </div>
      <Textarea
        rows={2}
        placeholder="Note to customer (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
