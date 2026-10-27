"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateBookingStatus } from "@/lib/actions/bookings";

// Confirm or cancel. Completing a booking isn't here: the vendor marks the
// job done on its job card (from the event date) and the customer confirms.
// Cancelling can't be undone and emails the customer, so it's confirmed first.
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
  const [confirmCancel, setConfirmCancel] = useState(false);

  function act(action: "confirm" | "cancel") {
    setError(null);
    startTransition(async () => {
      const res = await updateBookingStatus(bookingId, action);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setConfirmCancel(false);
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
        <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <DialogTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>
            Cancel booking
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel this booking?</DialogTitle>
              <DialogDescription>
                The customer will be told straight away. This can&apos;t be undone. To mark the
                job as done instead, use the job card below the booking.
              </DialogDescription>
            </DialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={pending} onClick={() => setConfirmCancel(false)}>
                Keep booking
              </Button>
              <Button variant="destructive" disabled={pending} onClick={() => act("cancel")}>
                Cancel booking
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {error && !confirmCancel && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
