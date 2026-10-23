"use client";

import Link from "next/link";
import { Bell, CalendarCheck, CalendarClock, ChevronRight, Clock, FileText, ImagePlus, Inbox, MessageCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { AttentionItem } from "@/lib/data/vendor-attention";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  enquiry: Inbox,
  confirm: CalendarClock,
  review: Clock,
  photos: ImagePlus,
  quote: FileText,
  booking: CalendarCheck,
  waiting: Clock,
} as const;

const URGENT: AttentionItem["kind"][] = ["enquiry", "quote"];
const WARN: AttentionItem["kind"][] = ["confirm"];

const MAX_ITEMS = 6;

function CountDot({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="absolute top-1 right-0.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] leading-[18px] font-semibold text-primary-foreground ring-2 ring-background">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

// Header buttons for signed-in customers and vendors: Messages, and a
// notifications bell, so neither needs a tab.
export function MessagesButton({ unread }: { unread: number }) {
  return (
    <Button
      variant="ghost"
      className="relative size-11 rounded-full p-0"
      nativeButton={false}
      aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
      render={
        <Link href="/messages">
          <MessageCircle className="size-[22px]" strokeWidth={1.75} aria-hidden />
          <CountDot count={unread} label="unread" />
        </Link>
      }
    />
  );
}

// The bell lists what's waiting (getVendorAttention / getCustomerAttention);
// there's no separate notifications store, so it's always current.
export function NotificationsBell({
  notificationCount,
  items,
  homeHref,
  homeLabel,
}: {
  notificationCount: number;
  items: AttentionItem[];
  homeHref: string;
  homeLabel: string;
}) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="relative size-11 rounded-full p-0"
              aria-label={notificationCount > 0 ? `Notifications, ${notificationCount} new` : "Notifications"}
            >
              <Bell className="size-[22px]" strokeWidth={1.75} aria-hidden />
              <CountDot count={notificationCount} label="new" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            <DropdownMenuGroup>
              {items.slice(0, MAX_ITEMS).map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <DropdownMenuItem
                    key={item.key}
                    className="items-start gap-3 py-2.5"
                    render={
                      <Link href={item.href}>
                        <Icon
                          className={cn(
                            "mt-0.5 size-[18px] shrink-0",
                            URGENT.includes(item.kind) ? "text-primary" : WARN.includes(item.kind) ? "text-warning" : "text-muted-foreground"
                          )}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug font-medium">{item.title}</span>
                          {item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}
                        </span>
                      </Link>
                    }
                  />
                );
              })}
            </DropdownMenuGroup>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={
              <Link href={homeHref} className="justify-between text-sm font-medium">
                {items.length > MAX_ITEMS ? `See all ${items.length} in ${homeLabel}` : `Go to ${homeLabel}`}
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
