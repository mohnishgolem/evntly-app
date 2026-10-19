"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { budgetBar, type BudgetSummary } from "@/lib/budget";
import { addBudgetItem, removeBudgetItem, setBudgetItemPaid, setEventBudget } from "@/lib/actions/budget";

type Line = { id: string; label: string; amount: number; paid?: boolean; kind: "booking" | "item" | "quote" };

const aud = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: n % 1 ? 2 : 0 });

export function BudgetTracker({
  eventId,
  summary,
  lines,
}: {
  eventId: string;
  summary: BudgetSummary;
  lines: Line[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(summary.budget));
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const bar = budgetBar(summary);

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <section className="mb-8 rounded-2xl border border-border p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="size-5 text-primary" strokeWidth={1.75} /> Budget
          </h2>
          {editingBudget ? (
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => setEventBudget(eventId, budgetInput), () => setEditingBudget(false));
              }}
            >
              <Input
                aria-label="Total budget"
                inputMode="decimal"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="h-8 w-32"
                autoFocus
              />
              <Button size="sm" type="submit" disabled={pending}>
                Save
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditingBudget(true)}
              className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {aud(summary.budget)} total <Pencil className="size-3.5" />
            </button>
          )}
        </div>
        <div className="text-right">
          <p className={cn("text-xl font-bold", summary.overBudget && "text-destructive")}>
            {summary.overBudget ? `${aud(-summary.remaining)} over` : `${aud(summary.remaining)} left`}
          </p>
          {summary.quoted > 0 && (
            <p className="text-xs text-muted-foreground">
              {summary.remainingIfAccepted < 0
                ? `${aud(-summary.remainingIfAccepted)} over if you accept open quotes`
                : `${aud(summary.remainingIfAccepted)} left if you accept open quotes`}
            </p>
          )}
        </div>
      </div>

      <div
        className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={`Booked ${aud(summary.booked)}, other costs ${aud(summary.other)}, open quotes ${aud(summary.quoted)}, budget ${aud(summary.budget)}`}
      >
        <span className="bg-primary" style={{ width: `${bar.booked}%` }} />
        <span className="bg-primary/55" style={{ width: `${bar.other}%` }} />
        <span className="bg-primary/20" style={{ width: `${bar.quoted}%` }} />
      </div>
      <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" /> Booked {aud(summary.booked)}</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary/55" /> Other costs {aud(summary.other)}</span>
        {summary.quoted > 0 && (
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary/20" /> Open quotes {aud(summary.quoted)}</span>
        )}
      </div>

      {lines.length > 0 && (
        <ul className="mb-4 divide-y divide-border text-sm">
          {lines.map((l) => (
            <li key={`${l.kind}-${l.id}`} className="flex items-center gap-3 py-2">
              {l.kind === "item" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setBudgetItemPaid(eventId, l.id, !l.paid))}
                  aria-label={l.paid ? `Mark ${l.label} unpaid` : `Mark ${l.label} paid`}
                  aria-pressed={!!l.paid}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    l.paid ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  )}
                >
                  {l.paid && <Check className="size-3" />}
                </button>
              ) : (
                <span className="size-5 shrink-0" />
              )}
              <span className={cn("min-w-0 flex-1 truncate", l.kind === "quote" && "text-muted-foreground")}>
                {l.label}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {l.kind === "booking" ? "· booked" : l.kind === "quote" ? "· quote, not accepted" : l.paid ? "· paid" : ""}
                </span>
              </span>
              <span className={cn("shrink-0 tabular-nums", l.kind === "quote" && "text-muted-foreground")}>{aud(l.amount)}</span>
              {l.kind === "item" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeBudgetItem(eventId, l.id))}
                  aria-label={`Remove ${l.label}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : (
                <span className="size-4 shrink-0" />
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addBudgetItem(eventId, label, amount), () => {
            setLabel("");
            setAmount("");
          });
        }}
      >
        <Input
          placeholder="Other cost, e.g. Venue hire"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          className="flex-1"
        />
        <Input
          placeholder="$ Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="sm:w-32"
        />
        <Button type="submit" variant="outline" disabled={pending || !label.trim() || !amount.trim()}>
          <Plus /> Add
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
