import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { requireAdminPage } from "@/lib/data/user";
import { getAllVendorsForAdmin } from "@/lib/data/admin";
import { categoryLabel } from "@/lib/config";
import { formatAbn } from "@/lib/abn";
import { AdminVendorActions } from "@/components/admin-vendor-actions";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";

export const metadata: Metadata = {
  title: "Vendor approvals",
  robots: { index: false, follow: false },
};

export default async function AdminApprovalsPage() {
  const { needsEnrol } = await requireAdminPage("/admin/approvals");
  if (needsEnrol) return <AdminMfaRequired />;

  const all = await getAllVendorsForAdmin();
  // Oldest first: whoever has waited longest gets reviewed first.
  const pending = all.filter((v) => v.status === "pending_review").reverse();
  // Progress toward the launch goal counts real businesses only.
  const real = all.filter((v) => !v.is_demo);
  const tally = (status: string) => real.filter((v) => v.status === status).length;
  const progress = [
    { label: "Live", value: tally("approved") },
    { label: "Waiting for review", value: tally("pending_review") },
    { label: "Rejected", value: tally("rejected") },
    { label: "Suspended", value: tally("suspended") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading
        title="Vendor approvals"
        description={`${pending.length} listing${pending.length === 1 ? "" : "s"} waiting for review.`}
      />
      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {progress.map((p) => (
          <div key={p.label} className="rounded-2xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{p.label}</dt>
            <dd className="text-xl font-bold tabular-nums">{p.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-6 -mt-3 text-xs text-muted-foreground">Real vendor listings (sample listings aren&apos;t counted).</p>
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
              <p className="break-all text-sm text-muted-foreground">
                {v.owner_email}
                {v.phone ? ` · ${v.phone}` : ""}
              </p>
              <p className="mt-1 text-sm">
                {v.abn ? (
                  <>
                    ABN {formatAbn(v.abn)}
                    {v.gst_registered ? " · GST registered" : ""} ·{" "}
                    <a
                      href={`https://abr.business.gov.au/ABN/View?abn=${encodeURIComponent(v.abn)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline underline-offset-2"
                    >
                      Check on the ABN Lookup
                    </a>
                  </>
                ) : (
                  <span className="text-warning">No ABN supplied</span>
                )}
              </p>
              {v.created_at && (
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(v.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" })}
                </p>
              )}
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
