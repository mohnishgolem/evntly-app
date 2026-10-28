import { CalendarCheck } from "lucide-react";

// Shown on sign-up/log-in when the visitor came from "Book this vendor":
// they shouldn't wonder whether they'll lose their place.
export function BookingReturnNote() {
  return (
    <div role="status" className="mb-6 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p>You&apos;ll go straight back to the vendor to finish your booking request.</p>
    </div>
  );
}
