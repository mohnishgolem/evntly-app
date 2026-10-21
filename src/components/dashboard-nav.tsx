"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref, NAV_SETS, type NavSetName } from "@/lib/nav";
import { cn } from "@/lib/utils";

// In-page section tabs (customer dashboard, vendor Enquiries / My Business).
// Highlights by prefix so detail pages (e.g. /dashboard/events/123) keep
// their section lit.
export function DashboardNav({
  tabs,
  label = "Sections",
}: {
  tabs: NavSetName;
  label?: string;
}) {
  const pathname = usePathname();
  const items = NAV_SETS[tabs];
  const current = activeHref(pathname, items);

  return (
    <nav aria-label={label} className="relative mb-6">
      <ul className="scrollbar-hide flex gap-2 overflow-x-auto">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:h-10",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Hints that the row scrolls further on narrow screens. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
    </nav>
  );
}
