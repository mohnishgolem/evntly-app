"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
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
import { activeHref, drawerSections, type NavRole } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Account dropdown (768px+). Same items as the drawer minus the marketplace
// links, which are already in the header.
export function UserMenu({
  role,
  email,
  displayName,
  unread = 0,
}: {
  role: NavRole;
  email: string;
  displayName?: string | null;
  unread?: number;
}) {
  const pathname = usePathname();
  const label = displayName || email;
  const initial = (label ?? "?").charAt(0).toUpperCase();
  const sections = drawerSections(role).filter((s) => s.title !== "Marketplace" && s.title !== undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label={unread > 0 ? `Account menu, ${unread} unread messages` : "Account menu"}
            className="relative size-11 rounded-full p-0"
          >
            <Avatar className="size-9">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            {unread > 0 && (
              <span aria-hidden className="absolute top-1 right-1 size-2.5 rounded-full bg-primary ring-2 ring-background" />
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
        </DropdownMenuGroup>
        {sections.map((section) => {
          const current = activeHref(pathname, section.items);
          return (
            <DropdownMenuGroup key={section.title}>
              <DropdownMenuSeparator />
              {sections.length > 1 && (
                <DropdownMenuLabel className="text-xs text-muted-foreground">{section.title}</DropdownMenuLabel>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = item.href === current;
                return (
                  <DropdownMenuItem
                    key={item.href}
                    className={cn(active && "bg-accent font-semibold")}
                    render={
                      <Link href={item.href} aria-current={active ? "page" : undefined}>
                        <Icon />
                        <span className="flex-1">{item.label}</span>
                        {item.badge === "unread" && unread > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </Link>
                    }
                  />
                );
              })}
            </DropdownMenuGroup>
          );
        })}
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
