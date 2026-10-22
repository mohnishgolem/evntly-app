"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmCalendarCurrent } from "@/lib/actions/vendor-pricing";
import { CALENDAR_FRESH_DAYS } from "@/lib/matching/engine";

// Customers see "Availability pending" for vendors whose calendar hasn't been
// touched in CALENDAR_FRESH_DAYS. Any calendar edit counts; this button is for
// when nothing changed.
export function CalendarFreshness({
  listings,
}: {
  listings: { id: string; name: string; availability_confirmed_at: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const stale = listings.filter((l) => {
    const t = l.availability_confirmed_at ? Date.parse(l.availability_confirmed_at) : NaN;
    return !Number.isFinite(t) || now - t > (CALENDAR_FRESH_DAYS - 7) * 86_400_000;
  });
  const last = listings
    .map((l) => (l.availability_confirmed_at ? Date.parse(l.availability_confirmed_at) : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  function confirm() {
    setError(null);
    startTransition(async () => {
      for (const l of listings) {
        const res = await confirmCalendarCurrent(l.id);
        if (res?.error) return setError(res.error);
      }
      router.refresh();
    });
  }

  return (
    <div
      className={
        stale.length
          ? "mb-6 flex flex-col gap-3 rounded-2xl border border-champagne/50 bg-champagne/10 p-4 sm:flex-row sm:items-center"
          : "mb-6 flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center"
      }
    >
      <CalendarCheck className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex-1 text-sm">
        {stale.length ? (
          <>
            <p className="font-medium">Is your calendar up to date?</p>
            <p className="text-muted-foreground">
              Customers see you as &ldquo;availability pending&rdquo; until you confirm. Block any days you&apos;re busy, then
              confirm.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            Calendar confirmed {last ? new Date(last).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""}.
            Customers see you as available on free days.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-1 text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button size="lg" variant={stale.length ? "default" : "outline"} disabled={pending} onClick={confirm}>
        {pending && <Loader2 className="animate-spin" aria-hidden />} My calendar is up to date
      </Button>
    </div>
  );
}
