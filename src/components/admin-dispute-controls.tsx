"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminUpdateDispute, postDisputeMessage } from "@/lib/actions/disputes";
import { DISPUTE_OUTCOMES, type DisputeStatus } from "@/lib/disputes";

export function AdminDisputeControls({ disputeId, status }: { disputeId: string; status: DisputeStatus }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const live = status === "open" || status === "under_review";

  function run(action: () => Promise<{ error?: string } | null>, ok: string, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      if (res?.error) setMessage({ ok: false, text: res.error });
      else {
        setMessage({ ok: true, text: ok });
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {live && (
        <section className="space-y-2">
          <Label htmlFor="admin-reply">Reply to both parties</Label>
          <Textarea id="admin-reply" rows={3} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} />
          <Button size="lg" disabled={pending || !reply.trim()} onClick={() => run(() => postDisputeMessage(disputeId, reply), "Reply sent.", () => setReply(""))}>
            Send reply
          </Button>
        </section>
      )}

      {live ? (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <h3 className="font-semibold">Decision</h3>
          {status === "open" && (
            <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => adminUpdateDispute({ disputeId, status: "under_review", outcome: null, note: "" }), "Marked under review — both parties notified.")}>
              Mark under review
            </Button>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="outcome">Outcome</Label>
            <select
              id="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:h-9 md:text-sm"
            >
              <option value="">Choose…</option>
              {DISPUTE_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resolution">Note to both parties</Label>
            <Textarea id="resolution" rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you found and what happens next (refunds are handled on the Payments page)." />
          </div>
          <Button size="lg" disabled={pending || !outcome || note.trim().length < 10} onClick={() => run(() => adminUpdateDispute({ disputeId, status: "resolved", outcome, note }), "Resolved — both parties notified.")}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Resolve dispute
          </Button>
        </section>
      ) : (
        status === "resolved" && (
          <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => adminUpdateDispute({ disputeId, status: "open", outcome: null, note: "" }), "Reopened.")}>
            Reopen
          </Button>
        )
      )}
      {message && (
        <p role="status" className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
