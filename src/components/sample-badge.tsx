import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

// Marks seeded demo vendors (is_demo). They show how Evntly works but aren't
// real businesses, so they must never pass for one.
export function SampleBadge({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span
      title="Sample listing: not a real business"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground shadow-sm ring-1 ring-border",
        className
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" />
      <span className={compact ? "hidden sm:inline" : undefined}>Sample listing</span>
      {compact && <span className="sr-only sm:hidden">Sample listing</span>}
    </span>
  );
}
