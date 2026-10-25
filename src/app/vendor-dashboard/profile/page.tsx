import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Bell,
  ChevronRight,
  CircleHelp,
  Clock,
  CreditCard,
  FileText,
  Images,
  LineChart,
  LogOut,
  Settings,
  ShieldCheck,
  Store,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/auth";
import { categoryLabel } from "@/lib/config";
import { formatAbn } from "@/lib/abn";
import { getPaymentsStatus } from "@/lib/payments/server";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

type Row = { href: string; icon: LucideIcon; label: string; detail?: string; external?: boolean };

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section aria-labelledby={`group-${title}`} className="mb-6">
      <h2 id={`group-${title}`} className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {rows.map((r) => {
          const Icon = r.icon;
          const inner = (
            <>
              <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{r.label}</span>
                {r.detail && <span className="block truncate text-xs text-muted-foreground">{r.detail}</span>}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </>
          );
          const cls =
            "flex min-h-14 items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60";
          return (
            <li key={r.label}>
              {r.external ? (
                <a href={r.href} className={cls}>
                  {inner}
                </a>
              ) : (
                <Link href={r.href} className={cls}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The vendor's account hub, laid out like a settings list. It links to
// existing pages rather than duplicating them.
export default async function VendorProfilePage() {
  const session = await requireVendor("/vendor-dashboard/profile");

  const supabase = await createClient();
  const [{ data: listings }, { data: stripe }, payments] = await Promise.all([
    supabase.rpc("my_service_providers").select("id, name, service_type, status, verified, abn").order("created_at"),
    supabase.from("stripe_accounts").select("transfers_active").eq("user_id", session.user.id).maybeSingle(),
    getPaymentsStatus(),
  ]);
  const primary = listings?.[0];
  const name = session.displayName || session.user.email;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Profile</h1>

      <div className="mb-8 flex items-center gap-4 rounded-2xl border border-border p-5">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold"
        >
          {(primary?.name ?? name ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{primary?.name ?? name}</p>
          {primary && <p className="text-sm text-muted-foreground">{categoryLabel(primary.service_type)}</p>}
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            {primary?.verified ? (
              <>
                <BadgeCheck className="size-4 text-success" aria-hidden /> Verified business
              </>
            ) : primary?.status === "approved" ? (
              <>
                <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Approved · not yet verified</span>
              </>
            ) : (
              <>
                <Clock className="size-4 text-warning" aria-hidden />
                <span className="text-muted-foreground">Under review</span>
              </>
            )}
          </p>
          {primary?.abn && <p className="text-xs text-muted-foreground">ABN {formatAbn(primary.abn)}</p>}
        </div>
      </div>

      <Group
        title="Business"
        rows={[
          ...(primary
            ? [{ href: `/vendor-dashboard/edit/${primary.id}`, icon: Store, label: "Business profile", detail: "Name, description, service area" }]
            : []),
          { href: "/vendor-dashboard/portfolio", icon: Images, label: "Portfolio", detail: "Photos and videos of your work" },
          { href: "/vendor-dashboard/earnings", icon: LineChart, label: "Analytics", detail: "Earnings and booking trends" },
        ]}
      />
      <Group
        title="Account"
        rows={[
          { href: "/profile", icon: UserRound, label: "Account details", detail: session.user.email ?? undefined },
          {
            href: "/vendor-dashboard/payouts",
            icon: CreditCard,
            label: "Payments",
            // Online payments are off at launch: customers pay vendors directly.
            detail: payments.enabled ? (stripe?.transfers_active ? "Payouts set up" : "Not set up yet") : "Paid directly by customers",
          },
          { href: "/dashboard/settings/notifications", icon: Bell, label: "Notifications", detail: "Email and push" },
          { href: "/dashboard/settings", icon: Settings, label: "Settings" },
        ]}
      />
      <Group
        title="Help"
        rows={[
          {
            href: "mailto:hello@evntlyapp.com",
            icon: CircleHelp,
            label: "Help & support",
            detail: "hello@evntlyapp.com",
            external: true,
          },
          { href: "/terms", icon: FileText, label: "Terms & privacy" },
        ]}
      />

      <form action={logout} data-clear-app-cache>
        <button
          type="submit"
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold text-destructive outline-none transition-colors hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="size-4" aria-hidden /> Log out
        </button>
      </form>
    </div>
  );
}
