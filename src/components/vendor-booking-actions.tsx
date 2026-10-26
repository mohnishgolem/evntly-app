"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateBookingStatus } from "@/lib/actions/bookings";

// Confirm or cancel. Completing a booking isn't here: the vendor marks the
// job done on its job card (from the event date) and the customer confirms.
export function VendorBookingActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(action: "confirm" | "cancel") {
    setError(null);
    startTransition(async () => {
      const res = await updateBookingStatus(bookingId, action);
      if (res?.error) setError(res.error);
      router.refresh();
    });
  }

  if (status !== "pending" && status !== "confirmed") return null;

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        {status === "pending" && (
          <Button size="sm" disabled={pending} onClick={() => act("confirm")}>
            Confirm booking
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act("cancel")}>
          Cancel
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
