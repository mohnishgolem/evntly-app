import { redirect } from "next/navigation";
import { ChevronRight, LogOut, Mail, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { logout } from "@/lib/actions/auth";

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

      <form action={logout} className="mt-6 overflow-hidden rounded-2xl bg-secondary">
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
