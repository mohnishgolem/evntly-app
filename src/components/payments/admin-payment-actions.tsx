"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminRefundMilestone,
  adminReleaseDisputed,
  adminRetryPayout,
  adminSetPaymentsEnabled,
} from "@/lib/actions/payments";

export function PaymentsSwitch({ enabled, canEnable, reason }: { enabled: boolean; canEnable: boolean; reason?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function set(next: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await adminSetPaymentsEnabled(next);
      if (res?.error) setError(res.error);
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {enabled ? (
        <Button variant="outline" disabled={pending} onClick={() => set(false)}>
          Switch online payments off
        </Button>
      ) : confirming ? (
        <div className="space-y-2 rounded-xl bg-warning/10 p-3 text-sm">
          <p>
            Turning payments on lets customers pay through Evntly and switches the message filter to <b>block</b> payment
            talk. Make sure the Terms describe Evntly holding funds first.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => set(true)}>
              Yes, switch on
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button disabled={pending || !canEnable} onClick={() => setConfirming(true)}>
          Switch online payments on
        </Button>
      )}
      {!enabled && !canEnable && reason && <p className="text-sm text-muted-foreground">{reason}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function MilestoneAdminActions({
  milestoneId,
  disputed,
  payoutFailed,
  refundable,
}: {
  milestoneId: string;
  disputed: boolean;
  payoutFailed: boolean;
  refundable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<null | "refund" | "release">(null);
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string; success?: boolean } | null>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res?.error ?? "Done.");
      if (!res?.error) setMode(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 space-y-2">
      {mode ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (recorded in the audit history)"
            className="max-w-xs"
          />
          <Button
            size="sm"
            variant={mode === "refund" ? "destructive" : "default"}
            disabled={pending || reason.trim().length < 5}
            onClick={() =>
              run(() => (mode === "refund" ? adminRefundMilestone(milestoneId, reason) : adminReleaseDisputed(milestoneId, reason)))
            }
          >
            {mode === "refund" ? "Refund customer" : "Release to vendor"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {payoutFailed && (
            <Button size="sm" disabled={pending} onClick={() => run(() => adminRetryPayout(milestoneId))}>
              Retry payout
            </Button>
          )}
          {disputed && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("release")}>
              Resolve: release
            </Button>
          )}
          {refundable && (
            <Button size="sm" variant="outline" className="text-destructive" disabled={pending} onClick={() => setMode("refund")}>
              Refund
            </Button>
          )}
        </div>
      )}
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
