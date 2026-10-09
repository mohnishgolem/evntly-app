"use client";

import { useState, useTransition } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { applyToEventListing } from "@/lib/actions/event-feed";

export function ApplyToEventForm({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Send /> Apply
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply to this event</DialogTitle>
        </DialogHeader>
        <ApplyForm listingId={listingId} onSent={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ApplyForm({ listingId, onSent }: { listingId: string; onSent: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pitch, setPitch] = useState("");
  const [amount, setAmount] = useState("");

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await applyToEventListing(listingId, pitch, Number(amount));
      if (res?.error) setError(res.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <p className="font-medium">Application sent!</p>
        <p className="text-sm text-muted-foreground">
          The organiser will get back to you if they&apos;d like to book you.
        </p>
        <Button variant="outline" onClick={onSent} className="mt-2">
          Close
        </Button>
      </div>
    );
  }

  const canSubmit = Number(amount) > 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="apply-amount">
          Your price ($) <span className="text-destructive">*</span>
        </Label>
        <Input
          id="apply-amount"
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="apply-pitch">Pitch (optional)</Label>
        <Textarea
          id="apply-pitch"
          rows={3}
          placeholder="Why you're a good fit for this event…"
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" disabled={!canSubmit || pending} onClick={submit}>
        {pending ? "Sending…" : "Send application"}
      </Button>
    </div>
  );
}
