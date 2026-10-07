import { redirect } from "next/navigation";
import { ShieldAlert, Store, Users, Flag, AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import {
  getAllVendorsForAdmin,
  getAllUsersForAdmin,
  getReportsForAdmin,
  getLeakageEventsForAdmin,
} from "@/lib/data/admin";
import { categoryLabel } from "@/lib/config";
import { AdminVendorActions } from "@/components/admin-vendor-actions";
import { AdminUserRoles } from "@/components/admin-user-roles";
import { AdminReports } from "@/components/admin-reports";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default async function AdminPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/admin");
  if (session.profile?.role !== "admin") redirect("/");

  const [vendors, users, reports, leakageEvents] = await Promise.all([
    getAllVendorsForAdmin(),
    getAllUsersForAdmin(),
    getReportsForAdmin(),
    getLeakageEventsForAdmin(),
  ]);

  const pending = vendors.filter((v) => v.status === "pending_review");
  const others = vendors.filter((v) => v.status !== "pending_review");
  const pendingReportsCount = reports.filter((r) => (r.status ?? "pending") === "pending").length;

  const leakageBySender = new Map<string, typeof leakageEvents>();
  for (const e of leakageEvents) {
    const key = e.sender_email ?? "Unknown";
    leakageBySender.set(key, [...(leakageBySender.get(key) ?? []), e]);
  }
  const leakageGroups = [...leakageBySender.entries()].sort((a, b) => b[1].length - a[1].length);

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
        <TabsList className="mb-6 w-full">
          <TabsTrigger value="vendors">
            <Store /> Vendor Approval
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Users /> User Roles
          </TabsTrigger>
          <TabsTrigger value="reports">
            <Flag /> Reports
          </TabsTrigger>
          <TabsTrigger value="leakage">
            <AlertTriangle /> Leakage Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
          <section className="mb-10">
            <h2 className="mb-4 text-lg font-semibold">Pending review ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting on you. 🎉</p>
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
                        <p className="text-sm text-muted-foreground">{v.owner_email}</p>
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
                <div key={v.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.owner_email}</p>
                  </div>
                  <span className="text-sm capitalize text-muted-foreground">{v.status}</span>
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

        <TabsContent value="leakage">
          {leakageGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leakage events logged.</p>
          ) : (
            <div className="space-y-6">
              <p className="text-xs text-muted-foreground">
                {leakageEvents.length} leakage event{leakageEvents.length === 1 ? "" : "s"}{" "}
                logged · sorted by offender frequency · original content visible to admin only
              </p>
              {leakageGroups.map(([sender, events]) => (
                <div key={sender} className="rounded-2xl border border-border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">{sender}</p>
                    <span className="text-xs text-muted-foreground">
                      {events.length} event{events.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {events.map((e) => (
                      <div key={e.id} className="border-t border-border/60 pt-2 text-sm">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                            {e.category}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString()}
                          </span>
                        </div>
                        {e.original_snippet && (
                          <p className="text-muted-foreground">
                            Matched: &quot;{e.original_snippet}&quot;
                          </p>
                        )}
                        {e.redacted_message && (
                          <p className="text-muted-foreground">
                            Delivered: &quot;{e.redacted_message}&quot;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
