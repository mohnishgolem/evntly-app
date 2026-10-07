import Link from "next/link";
import { LayoutDashboard, Settings, LogOut, Store, FileText, CalendarClock, ShieldAlert, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import type { Database } from "@/lib/supabase/database.types";

type UserRow = Database["public"]["Tables"]["users"]["Row"] | null;

export function UserMenu({
  profile,
  email,
  displayName,
}: {
  profile: UserRow;
  email: string;
  displayName?: string | null;
}) {
  const label = displayName || email;
  const initial = (label ?? "?").charAt(0).toUpperCase();
  const isVendor = profile?.role === "vendor";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="h-10 w-10 rounded-full p-0">
            <Avatar className="h-9 w-9">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={
              <Link href="/profile">
                <UserRound /> Profile
              </Link>
            }
          />
          <DropdownMenuItem
            render={
              <Link href={isVendor ? "/vendor-dashboard" : "/dashboard"}>
                <LayoutDashboard /> Dashboard
              </Link>
            }
          />
          <DropdownMenuItem
            render={
              <Link href={isVendor ? "/vendor-dashboard/quotes" : "/dashboard/quotes"}>
                <FileText /> Quotes
              </Link>
            }
          />
          <DropdownMenuItem
            render={
              <Link href={isVendor ? "/vendor-dashboard/bookings" : "/dashboard/bookings"}>
                <CalendarClock /> Bookings
              </Link>
            }
          />
          {isVendor && (
            <DropdownMenuItem
              render={
                <Link href="/vendor-signup">
                  <Store /> My listing
                </Link>
              }
            />
          )}
          {profile?.role === "admin" && (
            <DropdownMenuItem
              render={
                <Link href="/admin">
                  <ShieldAlert /> Admin
                </Link>
              }
            />
          )}
          <DropdownMenuItem
            render={
              <Link href="/dashboard/settings">
                <Settings /> Settings
              </Link>
            }
          />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          render={
            <form action={logout} className="w-full">
              <button type="submit" className="flex w-full items-center gap-2">
                <LogOut /> Log out
              </button>
            </form>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
