"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EVENT_TYPES, LAUNCH_CATEGORIES, VENDOR_CATEGORIES } from "@/lib/config";
import { claimEventPlan, type PlanDraft } from "@/lib/actions/events";
import { publishEventToFeed } from "@/lib/actions/event-feed";

const GUEST_BUCKETS = ["Under 80", "80 – 150", "Over 150"] as const;
const BUDGET_MIN = 500;
const BUDGET_MAX = 30000;

export default function PlanPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [postToFeed, setPostToFeed] = useState(true);
  const [draft, setDraft] = useState<PlanDraft>({
    eventType: "",
    eventDate: "",
    suburb: "",
    guestCount: "",
    budgetTotal: 10000,
    requiredServices: [],
    notes: "",
  });

  const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));

  const canSubmit =
    !!draft.eventType &&
    !!draft.eventDate &&
    !!draft.suburb &&
    !!draft.guestCount &&
    draft.requiredServices.length > 0 &&
    draft.budgetTotal > 0;

  function finish() {
    startTransition(async () => {
      // Already logged in? Save the event directly. claimEventPlan returns
      // {error: "Not logged in"} (without throwing) for anonymous visitors,
      // so fall back to the localStorage-draft-then-signup flow in that case.
      const res = await claimEventPlan(draft);
      if (res.success && res.eventId) {
        if (postToFeed) await publishEventToFeed(res.eventId);
        router.push(`/dashboard/events/${res.eventId}/vendors`);
        return;
      }
      localStorage.setItem("evntly_plan_draft", JSON.stringify({ draft, postToFeed }));
      router.push("/signup?next=/dashboard");
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold">Plan your event</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Tell us what you&apos;re planning and we&apos;ll build a personalised vendor board.
      </p>

      <div className="space-y-7">
        <Field title="What are you planning?">
          <div className="grid grid-cols-2 gap-2">
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
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
        </Field>

        <Field title="Event date">
          <Input
            type="date"
            value={draft.eventDate}
            onChange={(e) => setDraft((d) => ({ ...d, eventDate: e.target.value }))}
          />
        </Field>

        <Field title="Suburb">
          <Input
            placeholder="e.g. Bondi"
            value={draft.suburb}
            onChange={(e) => setDraft((d) => ({ ...d, suburb: e.target.value }))}
          />
        </Field>

        <Field title="What do you need?">
          <div className="grid grid-cols-2 gap-2">
            {categories.map((c) => {
              const selected = draft.requiredServices.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
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
                  <c.icon className="size-4" /> {c.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field title="How many guests?">
          <div className="grid grid-cols-3 gap-2">
            {GUEST_BUCKETS.map((bucket) => (
              <button
                key={bucket}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, guestCount: bucket }))}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm font-medium transition-colors",
                  draft.guestCount === bucket
                    ? "border-highlight bg-highlight-light text-highlight"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                )}
              >
                {bucket}
              </button>
            ))}
          </div>
        </Field>

        <Field title="Budget">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">${BUDGET_MIN.toLocaleString()}</span>
              <span className="font-semibold text-highlight">
                ${draft.budgetTotal.toLocaleString()}
              </span>
              <span className="text-muted-foreground">${BUDGET_MAX.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              step={250}
              value={draft.budgetTotal}
              onChange={(e) =>
                setDraft((d) => ({ ...d, budgetTotal: Number(e.target.value) }))
              }
              className="w-full accent-highlight"
            />
          </div>
        </Field>

        <Field title="Notes (optional)">
          <Textarea
            rows={3}
            placeholder="Any details about your vision, theme, or must-haves…"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          />
        </Field>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
          <div>
            <p className="text-sm font-semibold">Let vendors come to you</p>
            <p className="text-sm text-muted-foreground">
              Post this event to the vendor feed so approved vendors can send you quotes.
            </p>
          </div>
          <Switch checked={postToFeed} onCheckedChange={setPostToFeed} />
        </div>

        <Button className="w-full" size="lg" disabled={!canSubmit || pending} onClick={finish}>
          {pending ? "Building…" : "Build my event board"}
        </Button>
      </div>
    </div>
  );
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      {children}
    </div>
  );
}
