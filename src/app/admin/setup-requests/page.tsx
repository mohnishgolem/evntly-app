import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/data/user";
import { getListingCompletionCounts } from "@/lib/data/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { categoryLabel } from "@/lib/config";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { AdminSetupTools } from "@/components/admin-setup-tools";
import { MIN_PHOTOS } from "@/lib/listing-completion";

export const metadata: Metadata = {
  title: "Setup requests",
  robots: { index: false, follow: false },
};

// "Set it up for me" requests (R5). Vendor details are read with the service
// role after the admin check: owner emails aren't readable to admins via RLS.
export default async function AdminSetupRequestsPage() {
  const { needsEnrol } = await requireAdminPage("/admin/setup-requests");
  if (needsEnrol) return <AdminMfaRequired />;

  const db = createAdminClient();
  const { data: requests } = db
    ? await db
        .from("listing_setup_requests")
        .select("id, provider_id, services, photo_links, status, admin_note, created_at")
        .in("status", ["open", "ready"])
        .order("created_at", { ascending: true })
    : { data: [] };
  const ids = [...new Set((requests ?? []).map((r) => r.provider_id))];
  const [{ data: listings }, counts] = await Promise.all([
    db && ids.length
      ? db.from("service_providers").select("id, name, service_type, city, status, owner_email").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; name: string; service_type: string; city: string | null; status: string; owner_email: string }[] }),
    getListingCompletionCounts(ids),
  ]);
  const listingOf = new Map((listings ?? []).map((l) => [l.id, l]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading
        title="Setup requests"
        description="Vendors who asked us to set up their listing. Add their photos and packages, then send it back for them to check and submit."
      />
      {(requests ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No open requests.</p>
      ) : (
        <div className="space-y-4">
          {(requests ?? []).map((r) => {
            const l = listingOf.get(r.provider_id);
            const c = counts.get(r.provider_id) ?? { photos: 0, packages: 0 };
            return (
              <div key={r.id} className="rounded-2xl border border-border p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{l?.name ?? "Listing removed"}</p>
                  <span className="text-xs text-muted-foreground">
                    {r.status === "ready" ? "Sent back to the vendor" : "Open"} ·{" "}
                    {new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })}
                  </span>
                </div>
                {l && (
                  <p className="text-sm text-muted-foreground">
                    {categoryLabel(l.service_type)}
                    {l.city ? ` · ${l.city}` : ""} · <span className="break-all">{l.owner_email}</span> · listing {l.status}
                  </p>
                )}
                <p className="mt-3 text-xs font-medium text-muted-foreground">Services and prices</p>
                <p className="text-sm whitespace-pre-wrap">{r.services}</p>
                {r.photo_links && (
                  <>
                    <p className="mt-3 text-xs font-medium text-muted-foreground">Where to find photos (vendor confirmed permission)</p>
                    <p className="text-sm break-all whitespace-pre-wrap">{r.photo_links}</p>
                  </>
                )}
                <p className={c.photos >= MIN_PHOTOS && c.packages > 0 ? "mt-3 text-sm text-success" : "mt-3 text-sm text-warning"}>
                  {c.photos} photo{c.photos === 1 ? "" : "s"} · {c.packages} active package{c.packages === 1 ? "" : "s"}
                </p>
                {r.status === "open" && l?.status === "draft" && <AdminSetupTools requestId={r.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
