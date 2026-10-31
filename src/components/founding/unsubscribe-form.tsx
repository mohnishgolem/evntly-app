"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unsubscribeFromInvites, type FoundingActionState } from "@/lib/actions/founding";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FoundingActionState, FormData>(unsubscribeFromInvites, null);
  if (state?.success) {
    return (
      <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-secondary p-5 text-[15px]">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="t" value={token} />
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Unsubscribing…" : "Unsubscribe me"}
      </Button>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
