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
import { cancelBookingAsCustomer } from "@/lib/actions/bookings";

// Cancelling can't be undone and emails the vendor, so it's confirmed first.
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelBookingAsCustomer(bookingId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>
        Cancel booking
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            The vendor will be told straight away and the date is freed up. This can&apos;t be
            undone. Check the cancellation terms on your quote for any deposit you&apos;ve paid.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            Keep booking
          </Button>
          <Button variant="destructive" disabled={pending} onClick={cancel}>
            Cancel booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
