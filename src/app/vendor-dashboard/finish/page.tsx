import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ShieldCheck } from "lucide-react";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { PortfolioUploader } from "@/components/portfolio-uploader";
import { PackageList, type VendorPackageRow } from "@/components/vendor-pricing";
import { CompletionChecklist, SetupRequestForm, SubmitForReviewButton } from "@/components/listing-completion";
import { Button } from "@/components/ui/button";
import { PORTFOLIO_COLUMNS } from "@/lib/public-columns";
import { FINISH_PATH, MIN_PHOTOS, completionSteps, isListingComplete } from "@/lib/listing-completion";

export const metadata: Metadata = {
  title: "Finish your listing",
  robots: { index: false, follow: false },
};

// One page to finish a listing: the checklist, photos, packages and the
// Submit button (R1). Everything saves as the vendor goes, so they can leave
// and come back here. Approved listings that are still missing photos or a
// package use it too (without the submit step).
export default async function FinishListingPage() {
  const session = await requireVendor(FINISH_PATH);
  const supabase = await createClient();

  const { data: listing, error: listingError } = await supabase
    .rpc("my_service_providers")
    .select("id, name, status, service_type, hourly_rate, pricing_model, base_price, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (listingError) throw new Error(`Couldn't load your listing: ${listingError.message}`);
  if (!listing) return null; // requireVendor already sent vendors without a listing away.

  const [{ data: items }, { data: packages }, { data: setupRequest }] = await Promise.all([
    supabase
      .from("portfolio_items")
      .select(PORTFOLIO_COLUMNS)
      .eq("provider_id", listing.id)
      .order("sort_order", { ascending: true, nullsFirst: false }),
    supabase
      .from("vendor_packages")
      .select("id, provider_id, name, description, price_cents, included_hours, extra_hour_cents, inclusions, delivery_days, deposit_percent, active, sort_order")
      .eq("provider_id", listing.id)
      .order("sort_order")
      .order("price_cents"),
    supabase
      .from("listing_setup_requests")
      .select("id, status")
      .eq("provider_id", listing.id)
      .in("status", ["open", "ready"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const counts = {
    photos: (items ?? []).length,
    packages: ((packages ?? []) as VendorPackageRow[]).filter((p) => p.active).length,
  };
  const complete = isListingComplete(counts);
  const steps = completionSteps({ ...counts, status: listing.status });
  const isDraft = listing.status === "draft";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">{isDraft ? "Finish your listing" : "Your listing"}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {isDraft
          ? `${listing.name} is saved. Add ${MIN_PHOTOS} photos of your work and a package, then submit it for review. You can leave and come back any time.`
          : `${listing.name}: photos and packages are what customers look at first.`}
      </p>

      {listing.status === "pending_review" && (
        <p className="mb-6 flex gap-2.5 rounded-2xl bg-secondary p-4 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          Submitted. Our team is reviewing your listing and we&apos;ll email you when it&apos;s live.
        </p>
      )}
      {listing.status === "approved" && (
        <p className="mb-6 flex gap-2.5 rounded-2xl bg-secondary p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {complete
            ? "Your listing is live and complete."
            : "Your listing is live, but customers skip listings without photos and packages. Add them below."}
        </p>
      )}
      {setupRequest?.status === "ready" && isDraft && (
        <p className="mb-6 rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm">
          We&apos;ve prepared your photos and packages. Check them below, change anything you like, then submit.
        </p>
      )}

      {/* Done-with-you, offered before the uploader rather than only below the
          Submit button, where few vendors saw it. */}
      {!complete && setupRequest?.status !== "open" && setupRequest?.status !== "ready" && (
        <p className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-secondary p-4 text-sm">
          <span>Short on time? Send us your photos and your usual package, and we&apos;ll add them for you.</span>
          <a href="#done-for-you" className="font-medium text-foreground underline underline-offset-2">
            Show me how
          </a>
        </p>
      )}

      <div className="space-y-6">
        <CompletionChecklist steps={isDraft ? steps : steps.filter((s) => s.key !== "submit")} />

        <section id="photos" aria-labelledby="photos-heading" className="space-y-3">
          <h2 id="photos-heading" className="text-lg font-semibold">
            Photos of your work
          </h2>
          <PortfolioUploader providerId={listing.id} userId={session.user.id} items={items ?? []} />
        </section>

        <section id="packages" aria-labelledby="packages-heading" className="space-y-3">
          <h2 id="packages-heading" className="text-lg font-semibold">
            Packages
          </h2>
          <PackageList
            listingId={listing.id}
            listing={listing}
            packages={(packages ?? []) as VendorPackageRow[]}
            category={listing.service_type as string | null}
          />
        </section>

        {isDraft && (
          <>
            <SubmitForReviewButton providerId={listing.id} ready={complete} />
            {setupRequest?.status === "open" ? (
              <p className="rounded-2xl bg-secondary p-4 text-sm">
                We have your &quot;set it up for me&quot; request and will email you when your listing is ready to
                check.
              </p>
            ) : (
              !complete &&
              setupRequest?.status !== "ready" && (
                <div id="done-for-you" className="scroll-mt-24">
                  <SetupRequestForm providerId={listing.id} />
                </div>
              )
            )}
          </>
        )}

        {!isDraft && !complete && <SendUsYourPhotos listingName={listing.name} />}

        {!isDraft && (
          <Button variant="outline" nativeButton={false} render={<Link href="/vendor-dashboard/business">Back to your listing</Link>} />
        )}
      </div>
    </div>
  );
}

// Live listings can't use "Set it up for me" (that flow prepares a draft for
// the vendor to check before review). Approved vendors who haven't added
// photos get the same done-with-you route by email or DM instead: they send
// photos and a price, we add them with their written OK.
function SendUsYourPhotos({ listingName }: { listingName: string }) {
  const subject = encodeURIComponent(`Photos and packages for ${listingName}`);
  const body = encodeURIComponent(
    "Hi Evntly team,\n\nPlease add these to my listing. I'm happy for you to use the attached photos on my Evntly listing.\n\nMy usual package and price:\n\n"
  );
  return (
    <section id="done-for-you" aria-labelledby="send-photos-heading" className="scroll-mt-24 rounded-2xl border border-border p-5">
      <h2 id="send-photos-heading" className="text-[17px] font-semibold">
        Rather we add them for you?
      </h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
        Send us 3 photos of your work and your usual package with its price. We&apos;ll add them to your listing,
        usually within one business day.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button nativeButton={false} render={<a href={`mailto:hello@evntlyapp.com?subject=${subject}&body=${body}`}>Email your photos</a>} />
        <Button variant="outline" nativeButton={false} render={<a href="https://www.instagram.com/evntly.au/">Message @evntly.au</a>} />
      </div>
    </section>
  );
}
