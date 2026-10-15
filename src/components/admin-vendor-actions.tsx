"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setVendorStatus, type VendorStatus } from "@/lib/actions/admin";

export function AdminVendorActions({
  vendorId,
  currentStatus,
}: {
  vendorId: string;
  // Omitted for the pending-review queue (Approve/Reject). Passed for
  // already-decided listings so the right follow-up action shows instead —
  // previously there was no way to suspend an approved vendor at all.
  currentStatus?: Exclude<VendorStatus, "pending_review">;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(status: VendorStatus) {
    startTransition(async () => {
      setError(null);
      const res = await setVendorStatus(vendorId, status);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const errorLine = error && <p className="w-full text-xs text-destructive">{error}</p>;

  if (currentStatus) {
    const reactivate = currentStatus === "suspended" || currentStatus === "rejected";
    return (
      <div className="flex flex-wrap items-center gap-2">
        {reactivate ? (
          <Button size="sm" disabled={pending} onClick={() => act("approved")}>
            Reactivate
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act("suspended")}>
            Suspend
          </Button>
        )}
        {/* Sends the listing back to the review queue (hidden from Explore
            until approved again). */}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("pending_review")}>
          Move to pending
        </Button>
        {errorLine}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" disabled={pending} onClick={() => act("approved")}>
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act("rejected")}>
        Reject
      </Button>
      {errorLine}
    </div>
  );
}
