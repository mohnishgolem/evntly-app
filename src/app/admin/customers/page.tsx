import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const [users, { data: deletionRequests }] = await Promise.all([
    getAllUsersForAdmin(),
    // Admin-readable via RLS (is_admin(), which requires aal2).
    supabase
      .from("account_deletion_requests")
      .select("id, user_id, reason, requested_at")
      .eq("status", "pending")
      .order("requested_at"),
  ]);
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Customers" description="Every account and its role. Role changes are audit-logged." />
      {!!deletionRequests?.length && (
        <section aria-labelledby="deletion-requests" className="mb-8 rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <h2 id="deletion-requests" className="mb-2 font-semibold">
            Account deletion requests ({deletionRequests.length})
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Check for open bookings or disputes, then delete or de-identify the account in line with the Privacy Policy
            (completed manually for now).
          </p>
          <ul className="space-y-2 text-sm">
            {deletionRequests.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{emailById.get(r.user_id) ?? r.user_id}</span> ·{" "}
                {new Date(r.requested_at).toLocaleDateString("en-AU")}
                {r.reason && <span className="block text-muted-foreground">&ldquo;{r.reason}&rdquo;</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <AdminUserRoles users={users} />
    </div>
  );
}
