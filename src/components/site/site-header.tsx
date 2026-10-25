import Link from "next/link";
import { Suspense } from "react";
import { Menu } from "lucide-react";
import { getCurrentUser, getUnreadMessageCount } from "@/lib/data/user";
import { Button } from "@/components/ui/button";
import { NavDrawer } from "@/components/site/nav-drawer";
import { HeaderLinks } from "@/components/site/header-links";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { navRole } from "@/lib/nav";
import { getVendorAttention } from "@/lib/data/vendor-attention";
import { MessagesButton, NotificationsBell } from "@/components/site/header-actions";
import { getCustomerAttention } from "@/lib/data/customer-attention";

// The bar itself (logo, marketplace links) has no data, so it is in the very
// first bytes the server sends. Only the session-dependent buttons on the
// right wait for the session — behind Suspense, so they don't hold up the
// rest of the page.
export function SiteHeader() {
  return (
    <header className="glass-material sticky top-0 z-50 border-b border-border/60 pt-[env(safe-area-inset-top)] print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" aria-label="Evntly home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <HeaderLinks />
        </div>

        <Suspense
          fallback={
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              {/* Holds the menu button's place (phones) until it streams in. */}
              <span className="inline-flex size-11 items-center justify-center text-foreground desk:hidden" aria-hidden>
                <Menu className="size-[22px]" strokeWidth={1.75} />
              </span>
            </div>
          }
        >
          <HeaderActions />
        </Suspense>
      </div>
    </header>
  );
}

// Rendered on the server with the session already known, so the menu for
// the user's role arrives complete — no flash of the wrong navigation.
// Which links appear is presentation only: every page and action checks
// permissions itself.
async function HeaderActions() {
  const session = await getCurrentUser();
  const role = navRole(session?.profile?.role, !!session);

  const [unread, attention] = await Promise.all([
    getUnreadMessageCount(),
    role === "vendor" ? getVendorAttention() : role === "customer" ? getCustomerAttention() : null,
  ]);

  return (
    <div className="flex items-center gap-1.5">
      {(role === "customer" || role === "vendor") && <MessagesButton unread={unread} />}
      {(role === "customer" || role === "vendor") && (
        <NotificationsBell
          notificationCount={attention?.notificationCount ?? 0}
          items={attention?.items ?? []}
          homeHref={role === "vendor" ? "/vendor-dashboard" : "/dashboard"}
          homeLabel={role === "vendor" ? "Home" : "My Events"}
        />
      )}
      {!session && (
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
  );
}
