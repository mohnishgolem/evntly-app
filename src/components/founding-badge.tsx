import { Award } from "lucide-react";
import { cn } from "@/lib/utils";

// Solid pill so it stays legible on top of vendor photos as well as on the
// page background. `compact` hides the label on phones (cards are narrow).
export function FoundingBadge({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      title="Founding vendor"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm ring-1 ring-champagne/40",
        className
      )}
    >
      <Award className="size-3.5 shrink-0 text-champagne" />
      <span className={compact ? "hidden sm:inline" : undefined}>
        {compact ? "Founding" : "Founding vendor"}
      </span>
      {compact && <span className="sr-only sm:hidden">Founding vendor</span>}
    </span>
  );
}
