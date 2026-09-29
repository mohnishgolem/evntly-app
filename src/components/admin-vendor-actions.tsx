"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setVendorStatus } from "@/lib/actions/admin";

export function AdminVendorActions({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(status: "approved" | "rejected" | "suspended") {
    startTransition(async () => {
      await setVendorStatus(vendorId, status);
      router.refresh();
    });
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
