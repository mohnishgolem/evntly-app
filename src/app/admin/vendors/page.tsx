import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/data/user";
import { getAllVendorsForAdmin } from "@/lib/data/admin";
import { AdminVendorActions } from "@/components/admin-vendor-actions";
import { FoundingBadge } from "@/components/founding-badge";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";

export const metadata: Metadata = {
  title: "Vendors",
  robots: { index: false, follow: false },
};

export default async function AdminVendorsPage() {
  const { needsEnrol } = await requireAdminPage("/admin/vendors");
  if (needsEnrol) return <AdminMfaRequired />;

  const others = (await getAllVendorsForAdmin()).filter((v) => v.status !== "pending_review");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Vendors" description={`${others.length} decided listings. New ones are under Vendor Approvals.`} />
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
    </div>
  );
}
