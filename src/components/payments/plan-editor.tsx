"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { proposePaymentPlan } from "@/lib/actions/payments";
import { formatAud, parseDollarsToCents, suggestSplit } from "@/lib/payments/money";

type PlanType = "deposit_milestones" | "full" | "milestones";
type Row = { key: number; name: string; amount: string; dueDate: string; deliverables: string };

const OPTIONS: { value: PlanType; title: string; body: string }[] = [
  { value: "deposit_milestones", title: "Deposit + milestones", body: "A deposit secures the date, then payments as work is delivered." },
  { value: "full", title: "Full payment", body: "One payment, released when the customer approves the job." },
  { value: "milestones", title: "Milestones only", body: "Staged payments with no upfront deposit." },
];

const dollars = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, "");
let nextKey = 1;

function initialRows(type: PlanType, total: number): { deposit: string; rows: Row[] } {
  if (type === "full") return { deposit: "", rows: [{ key: nextKey++, name: "Full payment", amount: dollars(total), dueDate: "", deliverables: "" }] };
  const split = suggestSplit(total, type === "deposit_milestones" ? 25 : 0, 2);
  const names = ["Planning & preparation", "Event day"];
  return {
    deposit: type === "deposit_milestones" ? dollars(split.deposit) : "",
    rows: split.milestones.map((c, i) => ({ key: nextKey++, name: names[i], amount: dollars(c), dueDate: "", deliverables: "" })),
  };
}

// Vendor proposes how the agreed booking price is paid. The database
// re-validates everything (sum = total, deposit 10–50%, dates, shape).
export function PlanEditor({
  bookingId,
  totalCents,
  eventDate,
  commissionBps,
  onDone,
}: {
  bookingId: string;
  totalCents: number;
  eventDate: string | null;
  commissionBps: number;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<PlanType>("deposit_milestones");
  const init = useMemo(() => initialRows("deposit_milestones", totalCents), [totalCents]);
  const [deposit, setDeposit] = useState(init.deposit);
  const [rows, setRows] = useState<Row[]>(init.rows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function chooseType(next: PlanType) {
    setType(next);
    const fresh = initialRows(next, totalCents);
    setDeposit(fresh.deposit);
    setRows(fresh.rows);
  }

  const depositCents = type === "deposit_milestones" ? parseDollarsToCents(deposit) ?? 0 : 0;
  const rowCents = rows.map((r) => parseDollarsToCents(r.amount) ?? 0);
  const allocated = depositCents + rowCents.reduce((a, b) => a + b, 0);
  const remaining = totalCents - allocated;
  const depositPct = totalCents ? Math.round((depositCents / totalCents) * 100) : 0;
  const depositOk = type !== "deposit_milestones" || (depositCents * 100 >= totalCents * 10 && depositCents * 100 <= totalCents * 50);
  const valid = remaining === 0 && depositOk && rows.every((r, i) => r.name.trim() && rowCents[i] > 0);
  const fee = Math.round((totalCents * commissionBps) / 10_000);

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit() {
    setError(null);
    const items = [
      ...(type === "deposit_milestones"
        ? [{ kind: "deposit" as const, name: "Booking deposit", amountCents: depositCents }]
        : []),
      ...rows.map((r, i) => ({
        kind: type === "full" ? ("full" as const) : ("milestone" as const),
        name: r.name.trim(),
        amountCents: rowCents[i],
        dueDate: r.dueDate,
        deliverables: r.deliverables.trim() || undefined,
      })),
    ];
    startTransition(async () => {
      const res = await proposePaymentPlan({ bookingId, planType: type, items });
      if (res?.error) setError(res.error);
      else {
        onDone?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">How will the customer pay?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={type === o.value}
              onClick={() => chooseType(o.value)}
              className={cn(
                "rounded-2xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                type === o.value ? "border-highlight bg-highlight-light" : "border-border hover:border-foreground/30"
              )}
            >
              <span className="block text-sm font-semibold">{o.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.body}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {type === "deposit_milestones" && (
        <div className="rounded-2xl border border-border p-4">
          <Label htmlFor="deposit">Booking deposit</Label>
          <div className="mt-1.5 flex items-center gap-3">
            <Input id="deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="max-w-40" />
            <span className={cn("text-sm", depositOk ? "text-muted-foreground" : "font-medium text-destructive")}>
              {depositPct}% of the total {depositOk ? "" : "— must be 10–50%"}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Released to you when you confirm the booking.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.key} className="rounded-2xl border border-border p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem_10rem]">
              <div>
                <Label htmlFor={`name-${r.key}`}>{type === "full" ? "Payment" : `Milestone ${i + 1}`}</Label>
                <Input id={`name-${r.key}`} value={r.name} maxLength={120} onChange={(e) => update(r.key, { name: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor={`amt-${r.key}`}>Amount ($)</Label>
                <Input id={`amt-${r.key}`} inputMode="decimal" value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor={`due-${r.key}`}>Due</Label>
                <Input
                  id={`due-${r.key}`}
                  type="date"
                  value={r.dueDate}
                  max={eventDate ?? undefined}
                  onChange={(e) => update(r.key, { dueDate: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <Label htmlFor={`del-${r.key}`} className="mt-3 block">
              What you&apos;ll deliver
            </Label>
            <Textarea
              id={`del-${r.key}`}
              rows={2}
              maxLength={2000}
              value={r.deliverables}
              placeholder="e.g. Run sheet, playlist consult, 5 hours on the night"
              onChange={(e) => update(r.key, { deliverables: e.target.value })}
              className="mt-1.5"
            />
            {type !== "full" && rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            )}
          </div>
        ))}
        {type !== "full" && rows.length < 10 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, { key: nextKey++, name: "", amount: "", dueDate: "", deliverables: "" }])}
          >
            <Plus /> Add milestone
          </Button>
        )}
      </div>

      <div className="rounded-2xl bg-secondary p-4 text-sm">
        <div className="flex justify-between">
          <span>Booking total</span>
          <span className="font-semibold tabular-nums">{formatAud(totalCents)}</span>
        </div>
        <div className={cn("flex justify-between", remaining !== 0 && "font-medium text-destructive")}>
          <span>{remaining === 0 ? "Fully allocated" : remaining > 0 ? "Still to allocate" : "Over by"}</span>
          <span className="tabular-nums">{remaining === 0 ? "✓" : formatAud(Math.abs(remaining))}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-muted-foreground">
          <span>You receive (after Evntly&apos;s {commissionBps / 100}%)</span>
          <span className="tabular-nums">{formatAud(totalCents - fee)}</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button className="w-full sm:w-auto" disabled={!valid || pending} onClick={submit}>
        {pending ? "Sending…" : "Send plan to customer"}
      </Button>
    </div>
  );
}
