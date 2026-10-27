"use client";

import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// A small "?" next to a status or field that explains it in a sentence and
// links to the full article. Opens on tap/click (hover-only tooltips don't
// work on phones), and closes with Escape or a tap elsewhere.
export function HelpTip({
  label,
  children,
  article,
  className,
}: {
  /** What the tip explains, for screen readers: "About quote statuses". */
  label: string;
  children: React.ReactNode;
  /** Help article slug for "Learn more". */
  article?: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          // 20px icon, 32px hit area without shifting the layout around it.
          "relative inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground outline-none transition-colors",
          "before:absolute before:-inset-1.5 before:content-[''] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:text-foreground",
          className,
        )}
      >
        <CircleHelp className="size-4" strokeWidth={1.75} aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="bottom" className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl p-3.5 text-[13px] leading-relaxed">
        <div className="text-popover-foreground">{children}</div>
        {article && (
          <Link href={`/help/articles/${article}`} className="font-medium text-primary underline-offset-2 hover:underline">
            Learn more
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
