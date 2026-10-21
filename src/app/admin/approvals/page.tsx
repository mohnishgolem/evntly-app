import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { requireAdminPage } from "@/lib/data/user";
import { getAllVendorsForAdmin } from "@/lib/data/admin";
import { categoryLabel } from "@/lib/config";
import { AdminVendorActions } from "@/components/admin-vendor-actions";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";

export const metadata: Metadata = {
  title: "Vendor approvals",
  robots: { index: false, follow: false },
};

export default async function AdminApprovalsPage() {
  const { needsEnrol } = await requireAdminPage("/admin/approvals");
  if (needsEnrol) return <AdminMfaRequired />;

  const pending = (await getAllVendorsForAdmin()).filter((v) => v.status === "pending_review");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading
        title="Vendor approvals"
        description={`${pending.length} listing${pending.length === 1 ? "" : "s"} waiting for review.`}
      />
      {pending.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <PartyPopper className="size-4" /> Nothing waiting on you.
        </p>
      ) : (
        <div className="space-y-4">
          {pending.map((v) => (
            <div key={v.id} className="rounded-2xl border border-border p-5">
              <p className="font-semibold">{v.name}</p>
              <p className="text-sm text-muted-foreground">
                {categoryLabel(v.service_type)} · {v.city} · ${v.hourly_rate}/hr
              </p>
              <p className="break-all text-sm text-muted-foreground">{v.owner_email}</p>
              {v.bio && <p className="mt-2 text-sm">{v.bio}</p>}
              {!!v.locations_serviced?.length && (
                <p className="mt-1 text-xs text-muted-foreground">Services: {v.locations_serviced.join(", ")}</p>
              )}
              <AdminVendorActions vendorId={v.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
