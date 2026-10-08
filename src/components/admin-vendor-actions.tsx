"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setVendorStatus } from "@/lib/actions/admin";

export function AdminVendorActions({
  vendorId,
  currentStatus,
}: {
  vendorId: string;
  // Omitted for the pending-review queue (Approve/Reject). Passed for
  // already-decided listings so the right follow-up action shows instead —
  // previously there was no way to suspend an approved vendor at all.
  currentStatus?: "approved" | "rejected" | "suspended";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(status: "approved" | "rejected" | "suspended") {
    startTransition(async () => {
      await setVendorStatus(vendorId, status);
      router.refresh();
    });
  }

  if (currentStatus === "approved") {
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act("suspended")}>
        Suspend
      </Button>
    );
  }

  if (currentStatus === "suspended" || currentStatus === "rejected") {
    return (
      <Button size="sm" disabled={pending} onClick={() => act("approved")}>
        Reactivate
      </Button>
    );
  }

  return (
    <div className="mt-3 flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => act("approved")}>
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act("rejected")}>
        Reject
      </Button>
    </div>
  );
}
