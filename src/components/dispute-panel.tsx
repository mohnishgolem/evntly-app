"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { openDispute, postDisputeMessage, withdrawDispute } from "@/lib/actions/disputes";
import { DISPUTE_REASONS, DISPUTE_STATUS_LABEL, outcomeLabel, reasonLabel, type DisputeStatus } from "@/lib/disputes";
import { cn } from "@/lib/utils";

export type DisputeView = {
  id: string;
  reason: string;
  description: string;
  desired_outcome: string | null;
  status: DisputeStatus;
  outcome: string | null;
  resolution_note: string | null;
  opened_by_role: "customer" | "vendor";
  openedByMe: boolean;
  created_at: string;
  messages: { id: string; author_role: "customer" | "vendor" | "admin"; mine: boolean; body: string; created_at: string }[];
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });

function who(role: "customer" | "vendor" | "admin", mine: boolean) {
  if (mine) return "You";
  return role === "admin" ? "Evntly" : role === "vendor" ? "The vendor" : "The customer";
}

// "Report a problem" on a booking, and the shared thread once raised.
// Everything here is enforced again in the database RPCs.
export function DisputePanel({
  bookingId,
  role,
  disputes,
  canOpen,
}: {
  bookingId: string;
  role: "customer" | "vendor" | "admin";
  disputes: DisputeView[];
  canOpen: boolean;
}) {
  const live = disputes.find((d) => d.status === "open" || d.status === "under_review");
  const past = disputes.filter((d) => d !== live);
  if (!live && past.length === 0 && (!canOpen || role === "admin")) return null;

  return (
    <section aria-labelledby="problems" className="mb-8 space-y-3">
      <h2 id="problems" className="text-lg font-semibold">
        {live ? "Problem raised" : "Problems with this booking"}
      </h2>
      {live ? <LiveDispute dispute={live} readOnly={role === "admin"} /> : canOpen && role !== "admin" && <OpenForm bookingId={bookingId} role={role} />}
      {past.length > 0 && (
        <ul className="space-y-2">
          {past.map((d) => (
            <li key={d.id} className="rounded-2xl border border-border p-4 text-sm">
              <p className="font-medium">
                {reasonLabel(d.reason)} · {DISPUTE_STATUS_LABEL[d.status]}
                {d.outcome ? ` · ${outcomeLabel(d.outcome)}` : ""}
              </p>
              {d.resolution_note && <p className="mt-1 text-muted-foreground">{d.resolution_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OpenForm({ bookingId, role }: { bookingId: string; role: "customer" | "vendor" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [desired, setDesired] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          Something gone wrong? Try messaging first — if you can&apos;t sort it out, Evntly can step in.
        </p>
        <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
          <AlertTriangle aria-hidden /> Report a problem
        </Button>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await openDispute({ bookingId, reason, description, desiredOutcome: desired });
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border p-4 sm:p-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What&apos;s the problem?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DISPUTE_REASONS.map((r) => (
            <label
              key={r.value}
              className={cn(
                "flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors",
                reason === r.value ? "border-foreground bg-foreground/[0.03]" : "border-border hover:bg-muted"
              )}
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="dispute-desc">What happened?</Label>
        <Textarea
          id="dispute-desc"
          rows={5}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Dates, times and what was agreed help us most."
        />
        <p className="text-xs text-muted-foreground">
          The {role === "customer" ? "vendor" : "customer"} will see this and can reply.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dispute-want">What would put it right? (optional)</Label>
        <Textarea id="dispute-want" rows={2} maxLength={1000} value={desired} onChange={(e) => setDesired(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending || !reason || description.trim().length < 20}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} Send to Evntly
        </Button>
        <Button type="button" size="lg" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function LiveDispute({ dispute: d, readOnly }: { dispute: DisputeView; readOnly: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string } | null>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res?.error) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-champagne/50 bg-champagne/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-champagne/15 px-2.5 py-0.5 font-medium text-warning">{DISPUTE_STATUS_LABEL[d.status]}</span>
        <span className="text-muted-foreground">
          {reasonLabel(d.reason)} · raised by {d.openedByMe ? "you" : `the ${d.opened_by_role}`} · {when(d.created_at)}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        <p className="whitespace-pre-wrap">{d.description}</p>
        {d.desired_outcome && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Asked for:</span> {d.desired_outcome}
          </p>
        )}
      </div>

      {d.messages.length > 0 && (
        <ol className="space-y-2" aria-label="Replies">
          {d.messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm",
                m.mine ? "ml-auto bg-primary/10" : m.author_role === "admin" ? "border border-champagne/50 bg-background" : "bg-muted"
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {who(m.author_role, m.mine)} · {when(m.created_at)}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
      )}

      {!readOnly && (
        <div className="space-y-2">
          <Label htmlFor={`reply-${d.id}`} className="sr-only">
            Reply
          </Label>
          <Textarea
            id={`reply-${d.id}`}
            rows={3}
            maxLength={4000}
            placeholder="Add details or reply…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" disabled={pending || !body.trim()} onClick={() => run(() => postDisputeMessage(d.id, body), () => setBody(""))}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} Send reply
            </Button>
            {d.openedByMe &&
              (confirmWithdraw ? (
                <>
                  <span className="text-sm">Withdraw this dispute?</span>
                  <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => withdrawDispute(d.id))}>
                    Withdraw
                  </Button>
                  <Button size="lg" variant="ghost" disabled={pending} onClick={() => setConfirmWithdraw(false)}>
                    Keep
                  </Button>
                </>
              ) : (
                <Button size="lg" variant="ghost" disabled={pending} onClick={() => setConfirmWithdraw(true)}>
                  It&apos;s sorted — withdraw
                </Button>
              ))}
          </div>
          <p className="text-xs text-muted-foreground">Evntly aims to respond within 3 business days.</p>
        </div>
      )}
    </div>
  );
}
