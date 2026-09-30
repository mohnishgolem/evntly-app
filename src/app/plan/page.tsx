"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { EVENT_TYPES, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import type { PlanDraft } from "@/lib/actions/events";

const STEPS = ["Event type", "When & where", "Vendors", "Budget"] as const;

export default function PlanPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<PlanDraft>({
    eventType: "",
    eventDate: "",
    suburb: "",
    guestCount: "",
    budgetTotal: 0,
    requiredServices: [],
    notes: "",
  });

  const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

  const canAdvance = [
    !!draft.eventType,
    !!draft.eventDate && !!draft.suburb && !!draft.guestCount,
    draft.requiredServices.length > 0,
    draft.budgetTotal > 0,
  ][step];

  function finish() {
    localStorage.setItem("evntly_plan_draft", JSON.stringify(draft));
    router.push("/signup?next=/dashboard");
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-8 flex items-start gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={cn(
                "h-1.5 w-full rounded-full transition-colors",
                i <= step ? "bg-highlight" : "bg-muted"
              )}
            />
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <StepCard title="What are you planning?">
          <div className="grid grid-cols-2 gap-2">
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setDraft((d) => ({ ...d, eventType: t }))}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  draft.eventType === t
                    ? "border-highlight bg-highlight-light text-highlight"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </StepCard>
      )}

      {step === 1 && (
        <StepCard title="When and where is it?">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="eventDate">Event date</Label>
              <Input
                id="eventDate"
                type="date"
                value={draft.eventDate}
                onChange={(e) => setDraft((d) => ({ ...d, eventDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suburb">Suburb</Label>
              <Input
                id="suburb"
                placeholder="e.g. Bondi"
                value={draft.suburb}
                onChange={(e) => setDraft((d) => ({ ...d, suburb: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guestCount">Guest count</Label>
              <Input
                id="guestCount"
                placeholder="e.g. 50-75"
                value={draft.guestCount}
                onChange={(e) => setDraft((d) => ({ ...d, guestCount: e.target.value }))}
              />
            </div>
          </div>
        </StepCard>
      )}

      {step === 2 && (
        <StepCard title="Which vendors do you need?">
          <div className="grid grid-cols-2 gap-2">
            {categories.map((c) => {
              const selected = draft.requiredServices.includes(c.value);
              return (
                <button
                  key={c.value}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      requiredServices: selected
                        ? d.requiredServices.filter((v) => v !== c.value)
                        : [...d.requiredServices, c.value],
                    }))
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                    selected
                      ? "border-highlight bg-highlight-light text-highlight"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  <span>{c.icon}</span> {c.label}
                </button>
              );
            })}
          </div>
        </StepCard>
      )}

      {step === 3 && (
        <StepCard title="What's your budget?">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="budget">Total budget (AUD)</Label>
              <Input
                id="budget"
                type="number"
                min={0}
                placeholder="5000"
                value={draft.budgetTotal || ""}
                onChange={(e) => setDraft((d) => ({ ...d, budgetTotal: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Anything else? (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>
          </div>
        </StepCard>
      )}

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button className="flex-1" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : (
          <Button className="flex-1" disabled={!canAdvance} onClick={finish}>
            Create my account &amp; see matches
          </Button>
        )}
      </div>
    </div>
  );
}

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="mb-5 text-xl font-bold">{title}</h1>
      {children}
    </div>
  );
}
