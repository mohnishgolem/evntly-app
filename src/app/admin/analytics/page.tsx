import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/data/user";
import { getErrorSummaryForAdmin, getFunnelForAdmin } from "@/lib/data/admin";
import { AdminFunnel } from "@/components/admin-funnel";
import { AdminErrorLog } from "@/components/admin-error-log";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export default async function AdminAnalyticsPage() {
  const { needsEnrol } = await requireAdminPage("/admin/analytics");
  if (needsEnrol) return <AdminMfaRequired />;

  const [funnel, errors] = await Promise.all([getFunnelForAdmin(), getErrorSummaryForAdmin()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Analytics" description="Visitor funnel and application errors." />
      <section aria-labelledby="funnel" className="mb-10">
        <h2 id="funnel" className="mb-4 text-lg font-semibold">Funnel</h2>
        <AdminFunnel rows={funnel} />
      </section>
      <section aria-labelledby="errors">
        <h2 id="errors" className="mb-4 text-lg font-semibold">Errors{errors.length > 0 ? ` (${errors.length})` : ""}</h2>
        <AdminErrorLog errors={errors} />
      </section>
    </div>
  );
}
