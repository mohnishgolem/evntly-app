import Link from "next/link";
import { getCurrentUser, getUnreadMessageCount } from "@/lib/data/user";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/site/user-menu";
import { NavDrawer } from "@/components/site/nav-drawer";
import { HeaderLinks } from "@/components/site/header-links";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { navRole } from "@/lib/nav";
import { getVendorAttention } from "@/lib/data/vendor-attention";
import { VendorHeaderActions } from "@/components/site/vendor-header-actions";

// Rendered on the server with the session already known, so the menu for
// the user's role is in the first paint — no flash of the wrong navigation.
// Which links appear is presentation only: every page and action checks
// permissions itself.
export async function SiteHeader() {
  const session = await getCurrentUser();
  const role = navRole(session?.profile?.role, !!session);

  const unread = await getUnreadMessageCount();
  const attention = role === "vendor" ? await getVendorAttention() : null;

  return (
    <header className="glass-material sticky top-0 z-50 border-b border-border/60 pt-[env(safe-area-inset-top)] print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" aria-label="Evntly home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <HeaderLinks />
        </div>

        <div className="flex items-center gap-1.5">
          {role === "vendor" && (
            <VendorHeaderActions
              unread={unread}
              notificationCount={attention?.notificationCount ?? 0}
              items={attention?.items ?? []}
            />
          )}
          {session ? (
            <div className="hidden md:block">
              <UserMenu
                role={role}
                email={session.user.email ?? ""}
                displayName={session.displayName}
                unread={unread}
              />
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" nativeButton={false} render={<Link href="/login">Log in</Link>} />
              <Button nativeButton={false} render={<Link href="/signup">Sign up</Link>} />
            </div>
          )}
          <ThemeToggle />
          <NavDrawer
            role={role}
            name={session?.displayName}
            email={session?.user.email}
            unread={unread}
          />
        </div>
      </div>
    </header>
  );
}
