"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelBookingAsCustomer } from "@/lib/actions/bookings";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await cancelBookingAsCustomer(bookingId);
          router.refresh();
        })
      }
    >
      Cancel booking
    </Button>
  );
}
