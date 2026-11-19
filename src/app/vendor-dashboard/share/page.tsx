import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { getVendorPortfolio } from "@/lib/data/vendors";
import { categoryLabel, SITE_URL } from "@/lib/config";
import { isInAppBrowser } from "@/lib/in-app-browser";
import { sharePhotoOptions } from "@/lib/share-profile";
import { ShareProfile } from "@/components/share-profile";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Share profile",
  robots: { index: false, follow: false },
};

// Share profile: Story and profile-card artwork for the vendor's live
// listing. Only approved, real (non-sample) listings can be shared — the
// links must open a public page.
export default async function ShareProfilePage() {
  await requireVendor("/vendor-dashboard/share");
  const supabase = await createClient();
  const { data: listing } = await supabase
    .rpc("my_service_providers")
    .select("id, name, service_type, avatar_url, status, is_demo")
    .eq("status", "approved")
    .eq("is_demo", false)
    .limit(1)
    .maybeSingle();

  if (!listing) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Share profile</h1>
        <p className="mb-6 text-muted-foreground">
          You can share your profile once your listing is live. We&apos;ll email you as soon as it&apos;s approved.
        </p>
        <Button nativeButton={false} render={<Link href="/vendor-dashboard">Back to Home</Link>} />
      </div>
    );
  }

  const portfolio = await getVendorPortfolio(listing.id);
  return (
    <div className="px-4 py-6">
      <div className="mx-auto mb-4 max-w-md">
        <h1 className="text-2xl font-bold">Share profile</h1>
        <p className="text-sm text-muted-foreground">Post to your Story or share a card with a QR code. Customers land on your Evntly profile.</p>
      </div>
      <ShareProfile
        vendorId={listing.id}
        name={listing.name.trim()}
        category={categoryLabel(listing.service_type)}
        photos={sharePhotoOptions(portfolio, listing.avatar_url)}
        inAppBrowser={isInAppBrowser((await headers()).get("user-agent"))}
        siteUrl={SITE_URL}
        hasTabBar
      />
    </div>
  );
}
