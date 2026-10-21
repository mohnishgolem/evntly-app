import { NavList } from "@/components/site/nav-list";
import type { NavItem } from "@/lib/nav";

// Persistent left sidebar for the vendor and admin areas from 1200px.
// Below that, the same items are in the dark drawer.
export function AppSidebar({
  title,
  items,
  unread = 0,
}: {
  title: string;
  items: NavItem[];
  unread?: number;
}) {
  return (
    <aside className="hidden w-60 shrink-0 desk:block">
      <nav aria-label={title} className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto py-8 pr-2">
        <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
        <NavList items={items} variant="sidebar" unread={unread} />
      </nav>
    </aside>
  );
}

// Page frame for areas with a sidebar: centred, capped width so content
// doesn't stretch on 1440–1920px screens.
export function SidebarFrame({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="desk:mx-auto desk:flex desk:max-w-7xl desk:gap-6 desk:px-8">
      {sidebar}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
