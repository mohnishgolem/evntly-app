import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/data/user";
import { getAllUsersForAdmin } from "@/lib/data/admin";
import { AdminUserRoles } from "@/components/admin-user-roles";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";

export const metadata: Metadata = {
  title: "Customers",
  robots: { index: false, follow: false },
};

export default async function AdminCustomersPage() {
  const { needsEnrol } = await requireAdminPage("/admin/customers");
  if (needsEnrol) return <AdminMfaRequired />;

  const users = await getAllUsersForAdmin();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Customers" description="Every account and its role. Role changes are audit-logged." />
      <AdminUserRoles users={users} />
    </div>
  );
}
