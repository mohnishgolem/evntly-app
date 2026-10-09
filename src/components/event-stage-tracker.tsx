import { cn } from "@/lib/utils";

const STAGES = [
  "Create event",
  "Add vendor slots",
  "Quote and compare",
  "Book into escrow",
  "Track and message",
  "Event day",
  "Complete",
] as const;

export function EventStageTracker({ currentStage }: { currentStage: number }) {
  return (
    <div className="mb-6 flex items-center gap-1">
      {STAGES.map((label, i) => {
        const stage = i + 1;
        const reached = stage <= currentStage;
        return (
          <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div
              className={cn(
                "h-1.5 w-full rounded-full transition-colors",
                reached ? "bg-primary" : "bg-muted"
              )}
            />
            <span
              className={cn(
                "hidden text-center text-[10px] leading-tight sm:block",
                reached ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
