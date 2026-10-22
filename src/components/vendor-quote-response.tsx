"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { respondToQuote } from "@/lib/actions/quotes";

/** "" → null; "$1,200" → 1200; junk → NaN (caught before sending). */
function num(raw: string) {
  const clean = raw.replace(/[$,\s]/g, "");
  return clean ? Number(clean) : null;
}

// The vendor's reply: a total price, plus the details customers compare
// quotes on. Only the price is required; the rest is progressive disclosure.
export function VendorQuoteResponse({ quoteId, estimatedHours }: { quoteId: string; estimatedHours?: number | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    amount: "",
    coverageHours: estimatedHours ? String(estimatedHours) : "",
    travelFee: "",
    deposit: "",
    deliveryDays: "",
    inclusions: "",
    cancellationTerms: "",
    description: "",
    note: "",
  });
  const [details, setDetails] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const id = (k: string) => `${quoteId}-${k}`;

  function send() {
    setError(null);
    const amount = num(form.amount);
    const values = {
      coverageHours: num(form.coverageHours),
      travelFee: num(form.travelFee),
      deposit: num(form.deposit),
      deliveryDays: num(form.deliveryDays),
    };
    if (amount == null || !Number.isFinite(amount) || amount <= 0) return setError("Enter your total price.");
    if (Object.values(values).some((v) => v != null && !Number.isFinite(v))) return setError("Check the numbers you entered.");
    startTransition(async () => {
      const res = await respondToQuote(
        quoteId,
        "quote",
        {
          amount,
          ...values,
          deliveryDays: values.deliveryDays == null ? null : Math.round(values.deliveryDays),
          inclusions: form.inclusions
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          cancellationTerms: form.cancellationTerms,
          description: form.description,
        },
        form.note
      );
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function decline() {
    setError(null);
    startTransition(async () => {
      const res = await respondToQuote(quoteId, "decline", null, form.note);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-secondary p-3 sm:p-4">
      <div className="grid grid-cols-2 items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={id("amount")}>Total price (AUD)</Label>
          <Input className="h-11 md:h-9" id={id("amount")} inputMode="decimal" placeholder="$" value={form.amount} onChange={set("amount")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("hours")}>Hours of coverage</Label>
          <Input className="h-11 md:h-9" id={id("hours")} inputMode="decimal" placeholder="—" value={form.coverageHours} onChange={set("coverageHours")} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDetails((d) => !d)}
        aria-expanded={details}
        className="flex min-h-11 items-center gap-1 text-left text-sm font-medium"
      >
        <ChevronDown className={details ? "size-4 shrink-0 rotate-180 transition-transform" : "size-4 shrink-0 transition-transform"} aria-hidden />
        {details ? "Fewer details" : "Add inclusions, deposit and terms"}
      </button>

      {details && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor={id("travel")} className="text-xs">Travel (in total)</Label>
              <Input className="h-11 md:h-9" id={id("travel")} inputMode="decimal" placeholder="$0" value={form.travelFee} onChange={set("travelFee")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={id("deposit")} className="text-xs">Deposit</Label>
              <Input className="h-11 md:h-9" id={id("deposit")} inputMode="decimal" placeholder="$" value={form.deposit} onChange={set("deposit")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={id("delivery")} className="text-xs">Delivery (days)</Label>
              <Input className="h-11 md:h-9" id={id("delivery")} inputMode="numeric" placeholder="—" value={form.deliveryDays} onChange={set("deliveryDays")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("incl")}>What&apos;s included (one per line)</Label>
            <Textarea id={id("incl")} rows={3} value={form.inclusions} onChange={set("inclusions")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("desc")}>Service description</Label>
            <Textarea id={id("desc")} rows={2} maxLength={2000} value={form.description} onChange={set("description")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("cancel")}>Cancellation terms</Label>
            <Textarea
              id={id("cancel")}
              rows={2}
              maxLength={2000}
              placeholder="e.g. Deposit refundable up to 30 days before the event"
              value={form.cancellationTerms}
              onChange={set("cancellationTerms")}
            />
          </div>
        </div>
      )}

      <Textarea rows={2} placeholder="Message to the customer (optional)" value={form.note} onChange={set("note")} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" disabled={pending || !form.amount} onClick={send}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} Send quote
        </Button>
        {confirmDecline ? (
          <>
            <span className="text-sm">Decline this request?</span>
            <Button size="lg" variant="outline" disabled={pending} onClick={decline}>
              Decline
            </Button>
            <Button size="lg" variant="ghost" disabled={pending} onClick={() => setConfirmDecline(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="lg" variant="ghost" disabled={pending} onClick={() => setConfirmDecline(true)}>
            Decline
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Your quote stays open for the customer for 7 days, or until the event.</p>
    </div>
  );
}
