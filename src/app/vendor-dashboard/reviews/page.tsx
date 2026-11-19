import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { getVendorReviews } from "@/lib/data/vendors";
import { pastClientReviewUrl, reviewRequestMessage } from "@/lib/past-client-reviews";
import { ReviewRequestShare } from "@/components/review-request-share";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Get reviews",
  robots: { index: false, follow: false },
};

// Vendors ask clients they worked with before Evntly for a review: one link,
// a message to send, and the reviews they have so far.
export default async function VendorReviewsPage() {
  await requireVendor("/vendor-dashboard/reviews");
  const supabase = await createClient();
  const { data: listing } = await supabase
    .rpc("my_service_providers")
    .select("id, name, status, is_demo")
    .eq("status", "approved")
    .eq("is_demo", false)
    .limit(1)
    .maybeSingle();

  if (!listing) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Get reviews</h1>
        <p className="mb-6 text-muted-foreground">You can ask past clients for reviews once your listing is live.</p>
        <Button nativeButton={false} render={<Link href="/vendor-dashboard">Back to Home</Link>} />
      </div>
    );
  }

  const name = listing.name.trim();
  const reviews = await getVendorReviews(listing.id);
  const pastClient = reviews.filter((r) => r.source === "past_client").length;

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-2xl font-bold">Get reviews from past clients</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        Clients you worked with before Evntly can review you. Reviews count towards your star rating and help customers choose you.
      </p>

      <ReviewRequestShare url={pastClientReviewUrl(listing.id)} message={reviewRequestMessage(name, listing.id)} />

      <div className="mt-6 space-y-1.5 rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How it works</p>
        <p>Clients create a free Evntly account to post. Reviews go live straight away, marked “Past client · not booked on Evntly”.</p>
        <p>Only ask real clients. Don&apos;t write reviews yourself or ask friends or staff: we remove reviews that look fake.</p>
        <p>You can&apos;t edit or remove reviews, including low ones. Reply to feedback by doing great work next time.</p>
      </div>

      <section aria-labelledby="your-reviews" className="mt-8">
        <h2 id="your-reviews" className="mb-3 text-lg font-semibold">
          Your reviews {reviews.length > 0 && <span className="text-muted-foreground">({reviews.length})</span>}
        </h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet. Send your link to a few happy clients to get started.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {pastClient} from past clients · {reviews.length - pastClient} from Evntly bookings
            </p>
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {reviews.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {r.reviewer_name ?? "Anonymous"}
                    <span className="flex items-center gap-0.5">
                      <Star className="size-3.5 fill-champagne text-champagne" aria-hidden />
                      {r.rating}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {r.source === "past_client" ? "Past client" : "Evntly booking"}
                    </span>
                  </p>
                  {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
        <Link href={`/vendor/${listing.id}`} className="mt-3 inline-block text-sm font-medium underline underline-offset-2">
          See them on your profile
        </Link>
      </section>
    </div>
  );
}
