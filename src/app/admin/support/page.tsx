import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/data/user";
import { getReportsForAdmin, getLeakLogForAdmin } from "@/lib/data/admin";
import { AdminReports } from "@/components/admin-reports";
import { AdminLeakLog } from "@/components/admin-leak-log";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";

export const metadata: Metadata = {
  title: "Support",
  robots: { index: false, follow: false },
};

export default async function AdminSupportPage() {
  const { needsEnrol } = await requireAdminPage("/admin/support");
  if (needsEnrol) return <AdminMfaRequired />;

  const [reports, leakLog] = await Promise.all([getReportsForAdmin(), getLeakLogForAdmin()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Support" description="User reports and off-platform contact attempts." />
      <section aria-labelledby="reports" className="mb-10">
        <h2 id="reports" className="mb-4 text-lg font-semibold">Reports</h2>
        <AdminReports reports={reports} />
      </section>
      <section aria-labelledby="leaks">
        <h2 id="leaks" className="mb-4 text-lg font-semibold">Leak log</h2>
        <AdminLeakLog events={leakLog} />
      </section>
    </div>
  );
}
