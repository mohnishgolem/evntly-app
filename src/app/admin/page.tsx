import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Bug, ChevronRight, Flag, ShieldCheck, Store, Users, type LucideIcon } from "lucide-react";
import { requireAdminPage } from "@/lib/data/user";
import {
  getAllVendorsForAdmin,
  getAllUsersForAdmin,
  getReportsForAdmin,
  getErrorSummaryForAdmin,
} from "@/lib/data/admin";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

function Tile({
  href,
  icon: Icon,
  value,
  label,
  urgent,
}: {
  href: string;
  icon: LucideIcon;
  value: number;
  label: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-4 rounded-2xl border p-4 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
        urgent ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <Icon className={cn("size-6 shrink-0", urgent ? "text-primary" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-bold tabular-nums">{value}</span>
        <span className="block text-sm text-muted-foreground">{label}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export default async function AdminOverviewPage() {
  const { needsEnrol } = await requireAdminPage("/admin");
  if (needsEnrol) return <AdminMfaRequired />;

  const [vendors, users, reports, errors] = await Promise.all([
    getAllVendorsForAdmin(),
    getAllUsersForAdmin(),
    getReportsForAdmin(),
    getErrorSummaryForAdmin(),
  ]);

  const pending = vendors.filter((v) => v.status === "pending_review").length;
  const live = vendors.filter((v) => v.status === "approved" && !v.is_demo).length;
  const openReports = reports.filter((r) => (r.status ?? "pending") === "pending").length;
  const customers = users.filter((u) => u.role === "customer").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Overview" description="What needs an admin today." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Tile href="/admin/approvals" icon={ShieldCheck} value={pending} label="Vendors awaiting approval" urgent={pending > 0} />
        <Tile href="/admin/support" icon={Flag} value={openReports} label="Open reports" urgent={openReports > 0} />
        <Tile href="/admin/vendors" icon={Store} value={live} label="Live vendors (excl. samples)" />
        <Tile href="/admin/customers" icon={Users} value={customers} label="Customers" />
        <Tile href="/admin/analytics" icon={Bug} value={errors.length} label="Distinct errors logged" urgent={errors.length > 0} />
        <Tile href="/admin/analytics" icon={BarChart3} value={users.length} label="Total accounts" />
      </div>
    </div>
  );
}
