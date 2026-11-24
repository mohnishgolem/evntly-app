import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Where a booking is, at a glance. Derived only from the booking's status —
// no new states: pending = accepted and waiting for the vendor, confirmed =
// date locked in, completed = done. Cancelled/declined show a note instead.
const STEPS = ["Quote accepted", "Vendor confirmed", "Event done"] as const;

export function bookingStep(status: string): number | null {
  if (status === "pending") return 0;
  if (status === "confirmed") return 1;
  if (status === "completed") return 2;
  return null;
}

export function BookingProgress({ status, className }: { status: string; className?: string }) {
  const step = bookingStep(status);
  if (step == null) return null;
  return (
    <ol aria-label="Booking progress" className={cn("grid grid-cols-3 gap-2", className)}>
      {STEPS.map((label, i) => {
        const done = i <= step;
        return (
          <li key={label} aria-current={i === step ? "step" : undefined} className="min-w-0">
            <span className={cn("block h-1.5 rounded-full", done ? "[background:var(--gradient-coral)]" : "surface-pressed")} />
            <span className={cn("mt-2 flex items-center gap-1 text-xs font-medium", done ? "text-foreground" : "text-muted-foreground")}>
              {i < step && <Check className="size-3.5 shrink-0 text-success-text" aria-hidden />}
              <span className="truncate">{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const TONE = {
  waiting: "bg-warning/12 text-warning-text",
  action: "bg-primary/10 text-primary-text",
  good: "bg-success/10 text-success-text",
  muted: "bg-muted text-muted-foreground",
  bad: "bg-destructive/10 text-destructive-text",
} as const;

/** A small status pill; `tone` picks the colour. */
export function StatusPill({ tone, children, className }: { tone: keyof typeof TONE; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", TONE[tone], className)}>
      {children}
    </span>
  );
}
