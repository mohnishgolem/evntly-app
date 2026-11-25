import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/data/user";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { AdminDraftActions, AdminDraftForm } from "@/components/vendor-journey/admin-draft-tools";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/config";
import { draftsDb } from "@/lib/vendor-journey/server";
import { parseDraft } from "@/lib/vendor-journey/draft";

export const metadata: Metadata = { title: "Vendor drafts", robots: { index: false, follow: false } };

type Row = {
  id: string;
  origin: "self" | "assisted";
  data: unknown;
  email: string | null;
  permission_note: string | null;
  permission_at: string | null;
  link_sent_at: string | null;
  claim_opened_at: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—");

function status(r: Row) {
  if (r.claimed_at) return "Saved as listing";
  if (r.revoked_at) return "Revoked";
  if (new Date(r.expires_at).getTime() < Date.now()) return "Expired";
  if (r.claim_opened_at) return "Opened by owner";
  if (r.link_sent_at) return "Link sent";
  return "Not sent yet";
}

async function loadDrafts() {
  const db = draftsDb();
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  return Promise.all([
    db
      ? db
          .from("vendor_listing_drafts")
          .select("id, origin, data, email, permission_note, permission_at, link_sent_at, claim_opened_at, claimed_at, revoked_at, expires_at, created_at")
          .eq("origin", "assisted")
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: null, error: { message: "no db" } }),
    db
      ? db.from("vendor_listing_drafts").select("id", { count: "exact", head: true }).eq("origin", "self").gte("created_at", since)
      : Promise.resolve({ count: null }),
    (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: { step: number; stage: string; people: number }[] | null; error: { message: string } | null }>)(
      "admin_vendor_journey_funnel",
      { p_days: 30 }
    ),
  ]);
}

// Assisted drafts (prepared with the owner's permission) and the vendor
// journey funnel. Admins with MFA only; the table is service-role only.
export default async function AdminVendorDraftsPage() {
  const { needsEnrol } = await requireAdminPage("/admin/vendor-drafts");
  if (needsEnrol) return <AdminMfaRequired />;

  const [assisted, selfCount, funnel] = await loadDrafts();
  const notMigrated = !!assisted.error || !!funnel.error;
  const rows = (assisted.data ?? []) as Row[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AdminHeading
        title="Vendor drafts"
        description="Prepare a private listing draft for a business owner who said yes, then send them the claim link yourself. Nothing is public until they save, submit and we approve it."
      />
      {notMigrated && (
        <p className="mb-6 rounded-2xl bg-warning/15 p-4 text-sm">
          The <code>vendor_listing_drafts</code> migration (20261130090000) isn&apos;t applied yet, so drafts and the journey funnel aren&apos;t available.
        </p>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Vendor journey, last 30 days</h2>
        {funnel.data?.length ? (
          <table className="w-full text-sm">
            <tbody>
              {funnel.data.map((f) => (
                <tr key={f.step} className={f.step === 14 ? "border-t-2 border-border" : "border-t border-border/60"}>
                  <td className="py-1.5 pr-3 text-muted-foreground tabular-nums">{f.step}</td>
                  <td className="py-1.5">{f.stage}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{f.people}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        )}
        {typeof selfCount.count === "number" && <p className="mt-2 text-xs text-muted-foreground">{selfCount.count} self-serve drafts started in 30 days.</p>}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Prepare a draft with an owner&apos;s permission</h2>
        <AdminDraftForm />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Prepared drafts</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const d = parseDraft(r.data);
              const open = !r.claimed_at;
              return (
                <li key={r.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      {d.businessName || "Untitled"} <span className="font-normal text-muted-foreground">· {d.serviceType ? categoryLabel(d.serviceType) : "—"}</span>
                    </p>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">{status(r)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Permission {fmt(r.permission_at)}: {r.permission_note} · Created {fmt(r.created_at)} · Sent {fmt(r.link_sent_at)} · Opened {fmt(r.claim_opened_at)}
                  </p>
                  {open && (
                    <div className="mt-3">
                      <AdminDraftActions id={r.id} canRelink={!r.claimed_at} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
