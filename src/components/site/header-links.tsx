"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref, MARKETPLACE_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Marketplace links in the header from 1024px; below that they live in the
// drawer. The active page gets weight + an underline, not just colour.
export function HeaderLinks() {
  const pathname = usePathname();
  const current = activeHref(pathname, MARKETPLACE_NAV);

  return (
    <nav aria-label="Marketplace" className="hidden lg:block">
      <ul className="flex items-center gap-1 text-sm font-medium">
        {MARKETPLACE_NAV.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center rounded-full px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "text-foreground" : "text-foreground/70 hover:text-foreground",
                )}
              >
                {item.label}
                {active && (
                  <span aria-hidden className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-highlight" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
