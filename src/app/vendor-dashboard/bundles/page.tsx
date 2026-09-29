import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { getVendorPackages, getPendingInvitesForVendor } from "@/lib/data/bundles";
import { DashboardNav } from "@/components/dashboard-nav";
import { CreateBundleForm } from "@/components/create-bundle-form";
import { PackageInviteActions } from "@/components/package-invite-actions";

const NAV_ITEMS = [
  { href: "/vendor-dashboard", label: "Listings" },
  { href: "/vendor-dashboard/quotes", label: "Quotes" },
  { href: "/vendor-dashboard/bookings", label: "Bookings" },
  { href: "/vendor-dashboard/bundles", label: "Bundles" },
  { href: "/vendor-dashboard/portfolio", label: "Portfolio" },
  { href: "/messages", label: "Messages" },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting on other vendors",
  active: "Live — bookable by customers",
  cancelled: "A vendor declined",
};

export default async function VendorBundlesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard/bundles");

  const email = session.user.email as string;
  const [myPackages, invites] = await Promise.all([
    getVendorPackages(email),
    getPendingInvitesForVendor(email),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Bundles</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Team up with other vendors on a combined package customers can book together.
      </p>

      <DashboardNav items={NAV_ITEMS} />

      {invites.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Invitations to join a bundle</h2>
          <div className="space-y-3">
            {invites.map((inv) => (
              <div key={inv.id} className="rounded-2xl border border-border p-4">
                <p className="font-medium">{inv.combined_package_name}</p>
                <p className="text-sm text-muted-foreground">
                  Proposed by {inv.proposed_by_email} · Your share: ${inv.component_price}
                </p>
                <PackageInviteActions participantId={inv.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Create a bundle</h2>
        <CreateBundleForm />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Bundles you started</h2>
        {myPackages.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <div className="space-y-3">
            {myPackages.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{p.name}</p>
                  <span className="text-sm text-muted-foreground">
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {p.participant_emails?.length ?? 1} vendors · ${p.total_price}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
