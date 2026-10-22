"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setMatchingSettings } from "@/lib/actions/admin-matching";
import type { MatchWeights } from "@/lib/matching/engine";

const LABELS: Record<keyof MatchWeights, { label: string; hint: string }> = {
  suitability: { label: "Event suitability", hint: "Lists the event type; a package fits the hours" },
  budget: { label: "Budget fit", hint: "Best at 70–90% of the category budget" },
  quality: { label: "Portfolio & quality", hint: "Portfolio, verification, rating (3+ reviews)" },
  location: { label: "Location & travel", hint: "Closeness, travel fee, usual area" },
  reliability: { label: "Reliability", hint: "Reply rate and reply time (3+ requests)" },
};
const DEFAULTS: MatchWeights = { suitability: 30, budget: 25, quality: 20, location: 15, reliability: 10 };

export function AdminMatchingSettings({ enabled, weights }: { enabled: boolean; weights: Record<string, number> | null }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [form, setForm] = useState<Record<keyof MatchWeights, string>>(() =>
    Object.fromEntries(
      (Object.keys(DEFAULTS) as (keyof MatchWeights)[]).map((k) => [k, String(weights?.[k] ?? DEFAULTS[k])])
    ) as Record<keyof MatchWeights, string>
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const values = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])) as MatchWeights;
  const valid = Object.values(values).every((v) => Number.isFinite(v) && v >= 0 && v <= 100);
  const total = valid ? Object.values(values).reduce((a, b) => a + b, 0) : 0;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await setMatchingSettings({ enabled: on, weights: values });
      setMessage(res?.error ? { ok: false, text: res.error } : { ok: true, text: "Saved. Boards use the new settings on their next load." });
      if (!res?.error) router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border p-4 sm:p-5">
      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block font-medium">Smart matching</span>
          <span className="block text-sm text-muted-foreground">
            Off: event boards fall back to simple date/area/budget suggestions. Invite limits still apply.
          </span>
        </span>
        <Switch checked={on} onCheckedChange={setOn} />
      </label>
      <div className="space-y-3">
        {(Object.keys(LABELS) as (keyof MatchWeights)[]).map((k) => (
          <div key={k} className="grid grid-cols-[1fr_5.5rem] items-center gap-3">
            <Label htmlFor={`w-${k}`} className="block">
              <span className="block">{LABELS[k].label}</span>
              <span className="block text-xs font-normal text-muted-foreground">{LABELS[k].hint}</span>
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id={`w-${k}`}
                inputMode="numeric"
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                className="h-11 md:h-9 text-right"
              />
              <span className="w-8 text-right text-xs text-muted-foreground">
                {valid && total > 0 ? `${Math.round((values[k] / total) * 100)}%` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Weights are scaled to add up to 100{valid ? ` (currently ${total})` : ""}. Missing data always scores neutral, so new
        vendors aren&apos;t penalised. Every change is recorded in the audit log.
      </p>
      {message && (
        <p role="status" className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={pending || !valid || total <= 0} onClick={save}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} Save settings
        </Button>
        <Button
          size="lg"
          variant="ghost"
          disabled={pending}
          onClick={() => setForm(Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, String(v)])) as Record<keyof MatchWeights, string>)}
        >
          Reset to 30/25/20/15/10
        </Button>
      </div>
    </div>
  );
}
