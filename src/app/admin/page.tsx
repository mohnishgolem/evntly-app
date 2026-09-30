import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { getAllVendorsForAdmin } from "@/lib/data/admin";
import { categoryLabel } from "@/lib/config";
import { AdminVendorActions } from "@/components/admin-vendor-actions";

export default async function AdminPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/admin");
  if (session.profile?.role !== "admin") redirect("/");

  const vendors = await getAllVendorsForAdmin();
  const pending = vendors.filter((v) => v.status === "pending_review");
  const others = vendors.filter((v) => v.status !== "pending_review");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Admin — vendor approvals</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Review new vendor listings before they go live in search.
      </p>

      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert className="h-5 w-5 text-warning" /> Pending review ({pending.length})
        </h2>
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
    </div>
  );
}
