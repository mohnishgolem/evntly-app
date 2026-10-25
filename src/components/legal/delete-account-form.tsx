"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelAccountDeletion, requestAccountDeletion } from "@/lib/actions/legal";

export function DeleteAccountForm({ pendingSince }: { pendingSince: string | null }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string; ok?: boolean } | null>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  if (pendingSince) {
    return (
      <div className="space-y-3">
        <p role="status" className="rounded-2xl bg-secondary px-4 py-3 text-sm">
          We received your request on{" "}
          {new Date(pendingSince).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}. We&apos;ll
          email you when your account has been deleted.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button variant="outline" size="lg" disabled={pending} onClick={() => run(cancelAccountDeletion)}>
          Cancel my request
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="delete-reason">Why are you leaving? (optional)</Label>
        <Textarea id="delete-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex items-start gap-2">
        <Checkbox aria-labelledby="delete-confirm-label" id="delete-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
        <Label id="delete-confirm-label" htmlFor="delete-confirm" className="text-sm leading-snug font-normal text-muted-foreground">
          I understand my profile, events and any listing will be removed, and this can&apos;t be undone once completed.
        </Label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button variant="destructive" size="lg" disabled={pending || !confirmed} onClick={() => run(() => requestAccountDeletion({ reason }))}>
        {pending ? "Sending…" : "Request account deletion"}
      </Button>
    </div>
  );
}
