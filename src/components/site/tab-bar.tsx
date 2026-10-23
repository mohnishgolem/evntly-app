"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref, NAV_SETS, type NavSetName } from "@/lib/nav";
import { cn } from "@/lib/utils";

// iOS-style bottom tab bar for phones. A same-height spacer keeps the last
// bit of every page (and the footer) clear of it. The bar sits above the
// home indicator (safe-area inset, at least 8px) and is inset from the
// sides so the outer tabs clear the screen's rounded corners.
export function TabBar({
  nav = "customerTabBar",
  unread = 0,
  leads = 0,
}: {
  nav?: Extract<NavSetName, "customerTabBar" | "vendor">;
  unread?: number;
  leads?: number;
}) {
  const pathname = usePathname();
  const items = NAV_SETS[nav];
  const current = activeHref(pathname, items);

  return (
    <>
      <div aria-hidden className="h-[calc(3.5rem+max(0.5rem,env(safe-area-inset-bottom)))] md:hidden print:hidden" />
      <nav
        aria-label="Main"
        className="glass-material fixed inset-x-0 bottom-0 z-40 border-t border-border/60 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden print:hidden"
      >
        <ul className={cn("mx-auto grid h-14 max-w-md", items.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {items.map((item) => {
            const active = item.href === current;
            const Icon = item.icon;
            const badge = item.badge === "unread" ? unread : item.badge === "leads" ? leads : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium outline-none transition-colors focus-visible:bg-foreground/5",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <span className="relative">
                    <Icon className="size-6" strokeWidth={active ? 2.2 : 1.75} aria-hidden />
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-2.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] leading-[18px] font-semibold text-primary-foreground">
                        {badge > 99 ? "99+" : badge}
                        <span className="sr-only">{item.badge === "leads" ? " new" : " unread"}</span>
                      </span>
                    )}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
