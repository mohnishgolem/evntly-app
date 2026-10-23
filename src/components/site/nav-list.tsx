"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const VARIANTS = {
  // Dark drawer: 48px rows, always on the charcoal surface.
  drawer: {
    item: "h-12 gap-3.5 rounded-xl px-3 text-[17px] text-drawer-foreground hover:bg-drawer-hover focus-visible:bg-drawer-hover",
    active: "bg-drawer-active font-semibold",
    icon: "size-5 text-drawer-muted",
    activeIcon: "text-drawer-foreground",
  },
  // Desktop sidebar: Apple source-list style on the page's own surface.
  sidebar: {
    item: "h-10 gap-3 rounded-lg px-3 text-[15px] text-foreground/80 hover:bg-foreground/5 hover:text-foreground",
    active: "bg-foreground/[0.07] font-semibold text-foreground",
    icon: "size-[18px] text-muted-foreground",
    activeIcon: "text-highlight",
  },
} as const;

export function NavList({
  items,
  variant,
  unread = 0,
  leads = 0,
  onNavigate,
  label,
}: {
  items: NavItem[];
  variant: keyof typeof VARIANTS;
  unread?: number;
  leads?: number;
  onNavigate?: () => void;
  label?: string;
}) {
  const pathname = usePathname();
  const current = activeHref(pathname, items);
  const v = VARIANTS[variant];

  return (
    <ul className="flex flex-col gap-0.5" aria-label={label}>
      {items.map((item) => {
        const active = item.href === current;
        const Icon = item.icon;
        const count = item.badge === "unread" ? unread : item.badge === "leads" ? leads : 0;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-full items-center font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                v.item,
                active && v.active,
              )}
            >
              <Icon className={cn("shrink-0", v.icon, active && v.activeIcon)} strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {count > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
                  {count > 99 ? "99+" : count}
                  <span className="sr-only">{item.badge === "leads" ? " new" : " unread"}</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
