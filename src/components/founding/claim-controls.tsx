"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { claimFoundingPlace, updateMyFoundingApplication, type FoundingActionState } from "@/lib/actions/founding";

export function ClaimButton({ invite, source, label }: { invite: string | null; source: string | null; label: string }) {
  const [state, action, pending] = useActionState<FoundingActionState, FormData>(claimFoundingPlace, null);
  return (
    <form action={action} className="grid gap-2">
      {invite && <input type="hidden" name="invite" value={invite} />}
      {source && <input type="hidden" name="source" value={source} />}
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Claiming…" : label}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function ApplicationAction({
  action,
  label,
  variant = "default",
  confirm,
}: {
  action: "resubmit" | "withdraw" | "rejoin";
  label: string;
  variant?: "default" | "outline" | "ghost";
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <Button
        size="lg"
        variant={variant}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          startTransition(async () => {
            setError(null);
            const res = await updateMyFoundingApplication(action);
            if (res?.error) setError(res.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "Saving…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
