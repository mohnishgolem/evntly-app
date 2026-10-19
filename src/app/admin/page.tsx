import { redirect } from "next/navigation";
import { ShieldAlert, Store, Users, Flag, PartyPopper, Banknote } from "lucide-react";
import Link from "next/link";
import { getAdminSession } from "@/lib/data/user";
import {
  getAllVendorsForAdmin,
  getAllUsersForAdmin,
  getReportsForAdmin,
  getLeakLogForAdmin,
} from "@/lib/data/admin";
import { categoryLabel } from "@/lib/config";
import { AdminVendorActions } from "@/components/admin-vendor-actions";
import { FoundingBadge } from "@/components/founding-badge";
import { AdminUserRoles } from "@/components/admin-user-roles";
import { AdminReports } from "@/components/admin-reports";
import { AdminLeakLog } from "@/components/admin-leak-log";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default async function AdminPage() {
  const { session, admin, mfa } = await getAdminSession();
  if (!session) redirect("/login?next=/admin");
  if (!admin) redirect("/");
  if (mfa === "needs-verify") redirect("/login/mfa?next=/admin");
  if (mfa === "needs-enrol") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-warning" />
        <h1 className="mb-2 text-2xl font-bold">Two-factor authentication required</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          The admin dashboard can approve vendors and change user roles, so it needs an
          authenticator app on your account.
        </p>
        <Link
          href="/profile/security"
          className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Set up two-factor authentication
        </Link>
      </div>
    );
  }

  const [vendors, users, reports, leakLog] = await Promise.all([
    getAllVendorsForAdmin(),
    getAllUsersForAdmin(),
    getReportsForAdmin(),
    getLeakLogForAdmin(),
  ]);

  const pending = vendors.filter((v) => v.status === "pending_review");
  const others = vendors.filter((v) => v.status !== "pending_review");
  const pendingReportsCount = reports.filter((r) => (r.status ?? "pending") === "pending").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        <ShieldAlert className="h-6 w-6 text-warning" /> Admin Dashboard
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage vendors, users, and moderation.
      </p>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border p-4">
          <p className="text-2xl font-bold">{pending.length}</p>
          <p className="text-sm text-muted-foreground">Pending Vendors</p>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <p className="text-2xl font-bold">{users.length}</p>
          <p className="text-sm text-muted-foreground">Total Users</p>
        </div>
        <div className="rounded-2xl border border-border p-4">
          <p className="text-2xl font-bold">{pendingReportsCount}</p>
          <p className="text-sm text-muted-foreground">Open Reports</p>
        </div>
      </div>

      <Tabs defaultValue="vendors">
        {/* flex-1 on TabsTrigger can't shrink past its (icon + label) content
            width without min-w-0, so on narrow viewports the row overflowed
            and clipped the first tab off-screen. Let it scroll horizontally
            instead of trying to force 4+ full-width tabs into ~343px. */}
        <TabsList className="scrollbar-hide mb-6 w-full justify-start overflow-x-auto">
          <TabsTrigger value="vendors" className="shrink-0">
            <Store /> Vendor Approval
          </TabsTrigger>
          <TabsTrigger value="roles" className="shrink-0">
            <Users /> User Roles
          </TabsTrigger>
          <TabsTrigger value="reports" className="shrink-0">
            <Flag /> Reports
          </TabsTrigger>
          <TabsTrigger value="leak-log" className="shrink-0">
            <Banknote /> Leak Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
          <section className="mb-10">
            <h2 className="mb-4 text-lg font-semibold">Pending review ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <PartyPopper className="size-4" /> Nothing waiting on you.
              </p>
            ) : (
              <div className="space-y-4">
                {pending.map((v) => (
                  <div key={v.id} className="rounded-2xl border border-border p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold">{v.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {categoryLabel(v.service_type)} · {v.city} · ${v.hourly_rate}/hr
                        </p>
                        <p className="break-all text-sm text-muted-foreground">{v.owner_email}</p>
                        {v.bio && <p className="mt-2 text-sm">{v.bio}</p>}
                        {!!v.locations_serviced?.length && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Services: {v.locations_serviced.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <AdminVendorActions vendorId={v.id} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold">All other listings ({others.length})</h2>
            <div className="divide-y divide-border rounded-2xl border border-border">
              {others.map((v) => (
                // Stacks on phones: long owner emails used to push the
                // status and buttons off the right edge of the card.
                <div
                  key={v.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {v.name}
                      {v.founding_vendor && <FoundingBadge className="px-2 py-0.5" />}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">{v.owner_email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                    <span className="text-sm capitalize text-muted-foreground">{v.status}</span>
                    <AdminVendorActions
                      vendorId={v.id}
                      currentStatus={v.status as "approved" | "rejected" | "suspended"}
                      founding={!!v.founding_vendor}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="roles">
          <AdminUserRoles users={users} />
        </TabsContent>

        <TabsContent value="reports">
          <AdminReports reports={reports} />
        </TabsContent>

        <TabsContent value="leak-log">
          <AdminLeakLog events={leakLog} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
