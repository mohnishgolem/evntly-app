"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateBookingStatus } from "@/lib/actions/bookings";

export function VendorBookingActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(action: "confirm" | "complete" | "cancel") {
    startTransition(async () => {
      await updateBookingStatus(bookingId, action);
      router.refresh();
    });
  }

  if (status === "cancelled" || status === "completed") return null;

  return (
    <div className="mt-3 flex gap-2">
      {status === "pending" && (
        <Button size="sm" disabled={pending} onClick={() => act("confirm")}>
          Confirm booking
        </Button>
      )}
      {status === "confirmed" && (
        <Button size="sm" disabled={pending} onClick={() => act("complete")}>
          Mark completed
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act("cancel")}>
        Cancel
      </Button>
    </div>
  );
}
