"use client";

import Link from "next/link";
import { useEffect, useState, type KeyboardEvent } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { LogOut, Menu, X } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { Logo } from "@/components/site/logo";
import { NavList } from "@/components/site/nav-list";
import { drawerSections, type NavRole } from "@/lib/nav";
import { cn } from "@/lib/utils";

const TABBABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Base UI's trailing focus guard doesn't wrap back to the top (verified in
// 1.8), so keep Tab / Shift+Tab cycling inside the open drawer ourselves.
function trapTab(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "Tab") return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(TABBABLE)];
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const ROLE_LABEL: Record<NavRole, string | null> = {
  guest: null,
  customer: null,
  vendor: "Vendor",
  admin: "Admin",
};

// The dark slide-out menu, used below 1200px. Base UI's Dialog supplies the
// focus trap, Escape-to-close, scroll lock and focus return to the trigger.
export function NavDrawer({
  role,
  name,
  email,
  unread = 0,
}: {
  role: NavRole;
  name?: string | null;
  email?: string | null;
  unread?: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  // Also close on any route change (browser back/forward, links inside
  // the page) so the drawer never lingers over a new page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  const sections = drawerSections(role);
  const signedIn = role !== "guest";
  const label = name || email;
  // Come back to the current page after logging in.
  const loginHref =
    pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup")
      ? "/login"
      : `/login?next=${encodeURIComponent(pathname)}`;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Open menu"
        // Signed-in users get this menu at every width (it replaced the
        // laptop account dropdown); guests have header links from 1200px.
        className={cn(
          "relative inline-flex size-11 items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          !signedIn && "desk:hidden",
        )}
      >
        <Menu className="size-[22px]" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute top-2 right-2 size-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden />
        )}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-[60] bg-black/55 backdrop-blur-[6px]",
            "transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0",
          )}
        />
        <Dialog.Popup
          onKeyDown={trapTab}
          className={cn(
            "fixed inset-y-0 right-0 z-[60] flex w-[85vw] max-w-[22.5rem] flex-col",
            "bg-drawer text-drawer-foreground shadow-2xl shadow-black/40 outline-none",
            "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            "data-ending-style:translate-x-full data-starting-style:translate-x-full",
          )}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>

          {/* Header: wordmark + close. Safe-area insets keep it clear of the
              notch/status bar when installed to the home screen. */}
          <div className="flex items-center justify-between gap-3 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
            <Link href="/" onClick={close} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Logo className="text-[28px]" />
            </Link>
            <Dialog.Close
              aria-label="Close menu"
              className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-drawer-foreground outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-5" strokeWidth={2} />
            </Dialog.Close>
          </div>

          {signedIn && label && (
            <div className="mx-5 mt-2 mb-1 flex items-center gap-3 border-b border-drawer-border pb-4">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-base font-semibold"
              >
                {label.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{label}</p>
                <p className="truncate text-[13px] text-drawer-muted">
                  {ROLE_LABEL[role] ? `${ROLE_LABEL[role]} account` : email}
                </p>
              </div>
            </div>
          )}

          <nav aria-label="Main" className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">
            {sections.map((section, i) => (
              <div key={section.title ?? i} className={cn(i > 0 && "mt-4 border-t border-drawer-border pt-4")}>
                {section.title && (
                  <p className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-drawer-muted uppercase">
                    {section.title}
                  </p>
                )}
                <NavList
                  items={section.items}
                  variant="drawer"
                  unread={unread}
                  onNavigate={close}
                  label={section.title}
                />
              </div>
            ))}
          </nav>

          <div className="border-t border-drawer-border px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {signedIn ? (
              <form action={logout}>
                <button
                  type="submit"
                  className="flex h-12 w-full items-center gap-3.5 rounded-xl px-3 text-[17px] font-medium text-drawer-danger outline-none transition-colors hover:bg-drawer-hover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <LogOut className="size-5" strokeWidth={1.75} aria-hidden />
                  Log out
                </button>
              </form>
            ) : (
              <div className="flex flex-col gap-2 px-2 py-1">
                <Link
                  href="/signup"
                  onClick={close}
                  className="flex h-12 items-center justify-center rounded-full bg-primary text-[17px] font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Sign up
                </Link>
                <Link
                  href={loginHref}
                  onClick={close}
                  className="flex h-12 items-center justify-center rounded-full bg-white/10 text-[17px] font-semibold text-drawer-foreground outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Log in
                </Link>
              </div>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
