import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getVendorById } from "@/lib/data/vendors";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { categoryLabel } from "@/lib/config";
import { listingCoverUrl } from "@/lib/portfolio-media";
import { pastClientReviewPath } from "@/lib/past-client-reviews";
import { PastClientReviewForm } from "@/components/past-client-review-form";
import { Button } from "@/components/ui/button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const vendor = await getVendorById(id);
  return {
    title: vendor ? `Review ${vendor.name.trim()}` : "Leave a review",
    robots: { index: false, follow: false },
  };
}

// Where a vendor's past clients (booked outside Evntly) leave a review. The
// page is public; posting needs a free, verified account.
export default async function PastClientReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await getVendorById(id);
  if (!vendor || vendor.status !== "approved" || vendor.is_demo) notFound();

  const session = await getCurrentUser();
  let isOwn = false;
  let alreadyReviewed = false;
  if (session) {
    const supabase = await createClient();
    const { data: own } = await supabase.rpc("my_service_providers").select("id").eq("id", id).maybeSingle();
    isOwn = !!own;
    // reviewer_user_id isn't readable with the visitor's session; look it up server-side.
    const admin = createAdminClient();
    if (admin && !isOwn) {
      const { data: mine } = await admin
        .from("reviews")
        .select("id")
        .eq("provider_id", id)
        .eq("reviewer_user_id", session.user.id)
        .eq("source", "past_client")
        .limit(1)
        .maybeSingle();
      alreadyReviewed = !!mine;
    }
  }

  const name = vendor.name.trim();
  const cover = listingCoverUrl(vendor, 160);
  const back = encodeURIComponent(pastClientReviewPath(id));

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- small storage thumbnail, sized by Supabase
          <img src={cover} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
        ) : (
          <div aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{categoryLabel(vendor.service_type)}</p>
          <h1 className="text-2xl leading-tight font-bold">Review {name}</h1>
        </div>
      </div>

      {isOwn ? (
        <div className="space-y-4 rounded-2xl border border-border p-5 text-sm">
          <p>This is your own listing, so you can&apos;t review it. Send this page to your past clients instead.</p>
          <Button nativeButton={false} render={<Link href="/vendor-dashboard/reviews">Get reviews from past clients</Link>} />
        </div>
      ) : alreadyReviewed ? (
        <div className="space-y-4 rounded-2xl border border-border p-5 text-sm">
          <p>You&apos;ve already reviewed {name}. Thank you!</p>
          <Button nativeButton={false} render={<Link href={`/vendor/${id}`}>See their profile</Link>} />
        </div>
      ) : (
        <>
          <p className="mb-6 text-sm text-muted-foreground">
            Worked with {name} before Evntly? Tell others how it went. It takes about a minute.
          </p>
          <PastClientReviewForm
            vendorId={id}
            vendorName={name}
            signedIn={!!session}
            signupHref={`/signup?next=${back}`}
            loginHref={`/login?next=${back}`}
          />
        </>
      )}
    </div>
  );
}
