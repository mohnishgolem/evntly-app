import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/data/user";
import { getBetaAdminData } from "@/lib/data/admin-founding";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { BetaVendorsView } from "@/components/admin-beta-vendors-view";
import { inviteSendingStatus } from "@/lib/founding/sending";

export const metadata: Metadata = {
  title: "Beta vendors",
  robots: { index: false, follow: false },
};

export default async function AdminBetaVendorsPage() {
  const { needsEnrol } = await requireAdminPage("/admin/beta-vendors");
  if (needsEnrol) return <AdminMfaRequired />;

  const data = await getBetaAdminData();
  const sending = inviteSendingStatus();

  if (!data.deployed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <AdminHeading title="Beta vendors" />
        <p className="rounded-2xl border border-border p-5 text-sm">
          The founding vendor tables aren&apos;t in the database yet. Apply migration{" "}
          <code>20261101090000_founding_vendor_beta.sql</code> to turn this page on.
        </p>
      </div>
    );
  }

  return <BetaVendorsView data={data} sending={sending} />;
}
