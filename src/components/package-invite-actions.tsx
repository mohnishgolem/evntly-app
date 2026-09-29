"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { respondToPackageInvite } from "@/lib/actions/bundles";

export function PackageInviteActions({ participantId }: { participantId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function respond(action: "accept" | "decline") {
    startTransition(async () => {
      await respondToPackageInvite(participantId, action);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => respond("accept")}>
        Accept
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => respond("decline")}>
        Decline
      </Button>
    </div>
  );
}
