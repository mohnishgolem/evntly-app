import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell, ChevronRight, Lock, LogOut, Mail, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { logout } from "@/lib/actions/auth";

export const metadata: Metadata = {
  title: "Account settings",
  robots: { index: false, follow: false },
};

function Row({
  icon: Icon,
  label,
  value,
  last,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${last ? "" : "border-b border-border/60"}`}
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="flex-1 text-[15px]">{label}</span>
      <span className="max-w-[55%] truncate text-[15px] text-muted-foreground">{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/settings");

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-6 text-[28px] font-bold tracking-tight">Settings</h1>

      {/* Grouped list surface, iOS Settings-style, rather than a single boxed card. */}
      <div className="overflow-hidden rounded-2xl bg-secondary">
        <Row icon={Mail} label="Email" value={session.user.email ?? ""} />
        <Row
          icon={ShieldCheck}
          label="Account type"
          value={session.profile?.role ?? "customer"}
          last
        />
      </div>

      <Link
        href="/dashboard/settings/notifications"
        className="mt-6 flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-[15px] transition-colors hover:bg-accent"
      >
        <Bell className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="flex-1">Notifications</span>
        <ChevronRight className="size-4 text-muted-foreground/60" />
      </Link>

      <Link
        href="/dashboard/settings/legal"
        className="mt-3 flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-[15px] transition-colors hover:bg-accent"
      >
        <Lock className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="flex-1">Privacy &amp; legal</span>
        <ChevronRight className="size-4 text-muted-foreground/60" />
      </Link>

      <form action={logout} data-clear-app-cache className="mt-6 overflow-hidden rounded-2xl bg-secondary">
        <button
          type="submit"
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium text-destructive transition-colors hover:bg-accent"
        >
          <LogOut className="size-5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1">Log out</span>
          <ChevronRight className="size-4 text-muted-foreground/60" />
        </button>
      </form>
    </div>
  );
}
