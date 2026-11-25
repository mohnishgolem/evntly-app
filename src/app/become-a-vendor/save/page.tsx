import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ListingPreview } from "@/components/vendor-journey/listing-preview";
import { SaveListingForm } from "@/components/vendor-journey/save-listing-form";
import { createClient } from "@/lib/supabase/server";
import { pendingDraftFor } from "@/lib/vendor-journey/server";
import { readyToSave } from "@/lib/vendor-journey/draft";

export const metadata: Metadata = { title: "Save your listing", robots: { index: false, follow: false } };

// Signed-in, verified owner → ABN + agreement → their private draft listing.
export default async function SaveListingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup?role=vendor");

  const { data: existing } = await supabase.rpc("my_service_providers").select("id, status").limit(1).maybeSingle();
  if (existing?.status === "draft") redirect("/vendor-dashboard/finish");
  if (existing) redirect("/vendor-dashboard");

  const verified = !!user.email_confirmed_at;
  const pending = verified ? await pendingDraftFor({ email: user.email, emailVerified: true }) : null;

  if (!verified) {
    return (
      <Shell>
        <h1 className="text-title">Confirm your email first</h1>
        <p className="mt-3 text-muted-foreground">We sent a code to {user.email}. Once it&apos;s confirmed, come back here to save your listing.</p>
      </Shell>
    );
  }
  if (!pending) {
    return (
      <Shell>
        <h1 className="text-title">We couldn&apos;t find your draft</h1>
        <p className="mt-3 text-muted-foreground">
          Drafts are kept for 30 days on the device you started on, or under the email you saved them with. You can start
          again (it only takes a few minutes) or use the listing form.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" nativeButton={false} render={<Link href="/become-a-vendor/start">Build my listing</Link>} />
          <Button size="lg" variant="raised" nativeButton={false} render={<Link href="/vendor-signup">Use the listing form</Link>} />
        </div>
      </Shell>
    );
  }
  if (!readyToSave(pending.draft)) redirect("/become-a-vendor/start");

  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_380px] lg:py-12">
        <div className="min-w-0">
          <p className="text-eyebrow text-primary-text">Last step</p>
          <h1 className="mt-2 text-[28px] leading-tight font-bold tracking-tight sm:text-[34px]">Your ABN and our agreement</h1>
          <p className="mt-3 mb-6 text-[15px] text-muted-foreground">
            Your ABN must be valid, and a person reviews every listing before anything goes live.
          </p>
          <SaveListingForm assisted={pending.row.origin === "assisted"} />
        </div>
        <div>
          <ListingPreview draft={pending.draft} compact />
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-lg px-4 py-16 text-center">{children}</div>;
}
