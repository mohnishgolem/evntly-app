"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { respondToApplication } from "@/lib/actions/event-feed";

export function EventApplicationActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(action: "accept" | "decline") {
    setError(null);
    startTransition(async () => {
      const res = await respondToApplication(applicationId, action);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => respond("accept")}>
        Accept & book
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => respond("decline")}>
        Decline
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
