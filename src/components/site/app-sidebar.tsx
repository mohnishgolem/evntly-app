"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavList } from "@/components/site/nav-list";
import { activeHref, NAV_SETS, type NavSetName } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Persistent left sidebar for the vendor and admin areas from 1200px.
// Below that, admins use the dark drawer. With `rail`, tablets (768–1199px)
// get a slim icon rail with the same items, and phones the bottom tab bar.
export function AppSidebar({
  title,
  nav,
  unread = 0,
  leads = 0,
  rail = false,
}: {
  title: string;
  nav: NavSetName;
  unread?: number;
  leads?: number;
  rail?: boolean;
}) {
  return (
    <>
      {rail && <NavRail title={title} nav={nav} leads={leads} unread={unread} />}
      <aside className="hidden w-60 shrink-0 desk:block">
        <nav aria-label={title} className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto py-8 pr-2">
          <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
          <NavList items={NAV_SETS[nav]} variant="sidebar" unread={unread} leads={leads} />
        </nav>
      </aside>
    </>
  );
}

// Tablet icon rail: icon over a short label, like an iPad app's compact sidebar.
function NavRail({ title, nav, unread, leads }: { title: string; nav: NavSetName; unread: number; leads: number }) {
  const pathname = usePathname();
  const items = NAV_SETS[nav];
  const current = activeHref(pathname, items);

  return (
    <aside className="hidden w-20 shrink-0 border-r border-border/60 md:block desk:hidden">
      <nav aria-label={title} className="sticky top-16 py-6">
        <ul className="flex flex-col items-center gap-1">
          {items.map((item) => {
            const active = item.href === current;
            const Icon = item.icon;
            const count = item.badge === "unread" ? unread : item.badge === "leads" ? leads : 0;
            return (
              <li key={item.href} className="w-full px-2">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-foreground/[0.07] text-primary" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  )}
                >
                  <span className="relative">
                    <Icon className="size-6" strokeWidth={active ? 2.2 : 1.75} aria-hidden />
                    {count > 0 && (
                      <span className="absolute -top-1 -right-2.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] leading-[18px] font-semibold text-primary-foreground">
                        {count > 99 ? "99+" : count}
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
    </aside>
  );
}

// Page frame for areas with a sidebar: centred, capped width so content
// doesn't stretch on 1440–1920px screens. Tablets with a rail lay it out
// side by side too.
export function SidebarFrame({
  sidebar,
  rail = false,
  children,
}: {
  sidebar: React.ReactNode;
  rail?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("desk:mx-auto desk:flex desk:max-w-7xl desk:gap-6 desk:px-8", rail && "md:flex")}>
      {sidebar}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
