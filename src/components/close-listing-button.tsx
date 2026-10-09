"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { closeEventListing } from "@/lib/actions/event-feed";

export function CloseListingButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    startTransition(async () => {
      const res = await closeEventListing(listingId);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={close}>
        Close to new applications
      </Button>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
