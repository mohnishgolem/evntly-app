import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getBundleWithParticipants } from "@/lib/data/bundles";
import { getCurrentUser } from "@/lib/data/user";
import { BookBundleForm } from "@/components/book-bundle-form";
import { BUNDLES_PUBLIC, SITE_URL } from "@/lib/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { pkg, initiatingVendorApproved } = await getBundleWithParticipants(id);
  if (!pkg || pkg.status !== "active" || !initiatingVendorApproved) return {};

  const title = `${pkg.name} — vendor bundle`;
  const description =
    pkg.description ||
    `${pkg.participant_count || 1} vendors in one package from ${pkg.initiating_vendor_name ?? "Evntly vendors"}.`;
  const url = `${SITE_URL}/bundles/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
    twitter: { card: "summary_large_image", title, description },
    // Off the public navigation for launch (BUNDLES_PUBLIC); still reachable by link.
    ...(BUNDLES_PUBLIC ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function BundleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ pkg, participants, initiatingVendorApproved }, session] = await Promise.all([
    getBundleWithParticipants(id),
    getCurrentUser(),
  ]);

  if (!pkg || pkg.status !== "active" || !initiatingVendorApproved) notFound();

  const price = (pkg.total_price ?? 0) - (pkg.bundle_discount_amount ?? 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">{pkg.name}</h1>
      {pkg.category && <p className="text-muted-foreground">{pkg.category}</p>}
      {pkg.description && <p className="mt-4 leading-relaxed">{pkg.description}</p>}

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" /> Vendors in this bundle
        </h2>
        <div className="divide-y divide-border rounded-2xl border border-border">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium">{p.vendor_name ?? "Vendor"}</span>
              <span className="text-sm text-muted-foreground">${p.component_price}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 rounded-2xl border border-border p-5">
        <p className="mb-1 text-2xl font-bold">
          ${price}
          {!!pkg.bundle_discount_amount && (
            <span className="ml-2 text-base font-normal text-muted-foreground line-through">
              ${pkg.total_price}
            </span>
          )}
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          Payment is arranged directly with the vendors for now — booking here reserves the date
          and starts a group chat with everyone involved.
        </p>
        <BookBundleForm isAuthenticated={!!session} packageId={pkg.id} />
      </div>
    </div>
  );
}
