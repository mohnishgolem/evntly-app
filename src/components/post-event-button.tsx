"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publishEventToFeed } from "@/lib/actions/event-feed";

export function PostEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function post() {
    setError(null);
    startTransition(async () => {
      const res = await publishEventToFeed(eventId);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <Button disabled={pending} onClick={post}>
        <Megaphone /> {pending ? "Posting…" : "Post to Event Feed"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
