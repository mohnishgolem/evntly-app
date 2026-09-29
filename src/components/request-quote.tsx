"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FileText, CheckCircle2 } from "lucide-react";
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
import { requestQuote, type QuoteRequestDraft } from "@/lib/actions/quotes";
import { EVENT_TYPES } from "@/lib/config";

export function RequestQuote({
  isAuthenticated,
  vendorId,
  vendorEmail,
  vendorName,
  serviceType,
}: {
  isAuthenticated: boolean;
  vendorId: string;
  vendorEmail: string | null;
  vendorName: string;
  serviceType: string;
}) {
  const [open, setOpen] = useState(false);

  if (!isAuthenticated) {
    return (
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        nativeButton={false}
        render={<Link href={`/signup?next=/vendor/${vendorId}`}>Sign up to request a quote</Link>}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="lg" className="w-full">
            <FileText /> Request a quote
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a quote from {vendorName}</DialogTitle>
        </DialogHeader>
        <QuoteForm
          vendorId={vendorId}
          vendorEmail={vendorEmail ?? ""}
          vendorName={vendorName}
          serviceType={serviceType}
          onSent={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function QuoteForm({
  vendorId,
  vendorEmail,
  vendorName,
  serviceType,
  onSent,
}: {
  vendorId: string;
  vendorEmail: string;
  vendorName: string;
  serviceType: string;
  onSent: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [draft, setDraft] = useState<QuoteRequestDraft>({
    eventDate: "",
    eventType: EVENT_TYPES[0],
    location: "",
    estimatedGuests: 0,
    estimatedHours: undefined,
    budgetRange: "",
    details: "",
  });

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await requestQuote(vendorId, vendorEmail, vendorName, serviceType, draft);
      if (res?.error) setError(res.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <p className="font-medium">Quote request sent!</p>
        <p className="text-sm text-muted-foreground">
          {vendorName} will get back to you with a price soon.
        </p>
        <Button variant="outline" onClick={onSent} className="mt-2">
          Close
        </Button>
      </div>
    );
  }

  const canSubmit =
    draft.eventDate && draft.location && draft.estimatedGuests > 0 && draft.budgetRange;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="qr-date">Event date</Label>
          <Input
            id="qr-date"
            type="date"
            value={draft.eventDate}
            onChange={(e) => setDraft((d) => ({ ...d, eventDate: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qr-type">Event type</Label>
          <select
            id="qr-type"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={draft.eventType}
            onChange={(e) => setDraft((d) => ({ ...d, eventType: e.target.value }))}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qr-location">Location</Label>
        <Input
          id="qr-location"
          placeholder="e.g. Bondi, Sydney"
          value={draft.location}
          onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="qr-guests">Guest count</Label>
          <Input
            id="qr-guests"
            type="number"
            min={1}
            value={draft.estimatedGuests || ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, estimatedGuests: Number(e.target.value) }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qr-hours">Duration (hrs, optional)</Label>
          <Input
            id="qr-hours"
            type="number"
            min={1}
            value={draft.estimatedHours ?? ""}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                estimatedHours: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qr-budget">Budget range</Label>
        <Input
          id="qr-budget"
          placeholder="e.g. $500-1000"
          value={draft.budgetRange}
          onChange={(e) => setDraft((d) => ({ ...d, budgetRange: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qr-details">Details (optional)</Label>
        <Textarea
          id="qr-details"
          rows={3}
          value={draft.details}
          onChange={(e) => setDraft((d) => ({ ...d, details: e.target.value }))}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" disabled={!canSubmit || pending} onClick={submit}>
        {pending ? "Sending…" : "Send quote request"}
      </Button>
    </div>
  );
}
