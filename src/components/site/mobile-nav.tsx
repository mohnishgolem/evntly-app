"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Menu,
  LayoutDashboard,
  Settings,
  LogOut,
  Store,
  FileText,
  CalendarClock,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { logout } from "@/lib/actions/auth";
import { Logo } from "@/components/site/logo";
import type { Database } from "@/lib/supabase/database.types";

type UserRow = Database["public"]["Tables"]["users"]["Row"] | null;

export function MobileNav({
  isAuthenticated,
  profile,
}: {
  isAuthenticated: boolean;
  profile: UserRow;
}) {
  const [open, setOpen] = useState(false);
  const isVendor = profile?.role === "vendor";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu />
          </Button>
        }
      />
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4 text-sm font-medium">
          <Link href="/" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-muted">
            Home
          </Link>
          <Link href="/explore" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-muted">
            Explore
          </Link>
          <Link href="/bundles" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-muted">
            Bundles
          </Link>
          <Link href="/plan" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 hover:bg-muted">
            Start planning
          </Link>

          <div className="my-2 border-t border-border" />

          {isAuthenticated ? (
            <>
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-muted"
              >
                <UserRound className="size-4" /> Profile
              </Link>
              <Link
                href={isVendor ? "/vendor-dashboard" : "/dashboard"}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-muted"
              >
                <LayoutDashboard className="size-4" /> Dashboard
              </Link>
              <Link
                href={isVendor ? "/vendor-dashboard/quotes" : "/dashboard/quotes"}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-muted"
              >
                <FileText className="size-4" /> Quotes
              </Link>
              <Link
                href={isVendor ? "/vendor-dashboard/bookings" : "/dashboard/bookings"}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-muted"
              >
                <CalendarClock className="size-4" /> Bookings
              </Link>
              {isVendor && (
                <Link
                  href="/vendor-signup"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-muted"
                >
                  <Store className="size-4" /> My listing
                </Link>
              )}
              {profile?.role === "admin" && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-muted"
                >
                  <ShieldAlert className="size-4" /> Admin
                </Link>
              )}
              <Link
                href="/dashboard/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-muted"
              >
                <Settings className="size-4" /> Settings
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-destructive hover:bg-muted"
                >
                  <LogOut className="size-4" /> Log out
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col gap-2 px-3 pt-2">
              <Button
                nativeButton={false}
                onClick={() => setOpen(false)}
                render={<Link href="/signup">Sign up</Link>}
              />
              <Button
                variant="outline"
                nativeButton={false}
                onClick={() => setOpen(false)}
                render={<Link href="/login">Log in</Link>}
              />
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
