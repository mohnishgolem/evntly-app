import type { Metadata } from "next";
import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingPreview } from "@/components/vendor-journey/listing-preview";
import { openClaimLink } from "@/lib/actions/vendor-journey";
import { draftByToken } from "@/lib/vendor-journey/server";

export const metadata: Metadata = {
  title: "Your Evntly listing draft",
  robots: { index: false, follow: false },
  // The link is a secret: never send it on to other sites.
  referrer: "no-referrer",
};

// A business owner opens the private link our team sent them. They see the
// draft we prepared with their permission and choose to review it. Nothing
// is public, and only their own verified email can save it as a listing.
export default async function ClaimDraftPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await draftByToken(token);

  if (!found || found.row.origin !== "assisted") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-title">This link has expired</h1>
        <p className="mt-3 text-muted-foreground">
          Claim links last 30 days and stop working once used or replaced. Email{" "}
          <a className="font-medium text-foreground underline underline-offset-2" href="mailto:hello@evntlyapp.com">
            hello@evntlyapp.com
          </a>{" "}
          and we&apos;ll send a new one, or build your listing yourself.
        </p>
        <Button className="mt-6" size="lg" nativeButton={false} render={<Link href="/become-a-vendor/start">Build my listing</Link>} />
      </div>
    );
  }

  const open = openClaimLink.bind(null, token);

  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_380px] lg:py-14">
        <div>
          <p className="text-eyebrow text-primary-text">Prepared for you by Evntly</p>
          <h1 className="mt-2 text-[30px] leading-tight font-bold tracking-tight sm:text-[38px]">
            We&apos;ve drafted your listing. Is it right?
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
            You told us we could get your listing started. Check every detail, change anything you like and add your own touch.
            It only becomes your listing when you save it, and only goes live after you submit it and we&apos;ve checked it.
          </p>

          <ul className="mt-6 space-y-3 text-[15px]">
            <li className="flex gap-3">
              <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-semibold">Private.</span> Nobody else can see this draft. Don&apos;t forward this link.
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-semibold">You&apos;re in control.</span> To save it you&apos;ll confirm your email, add your ABN and accept
                the vendor agreement, the same as every Evntly vendor.
              </span>
            </li>
          </ul>

          <form action={open} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button type="submit" size="lg">
              Review and edit my listing
            </Button>
            <Button
              variant="raised"
              size="lg"
              nativeButton={false}
              render={<a href="mailto:hello@evntlyapp.com?subject=Please%20delete%20my%20Evntly%20draft">Not for me: delete it</a>}
            />
          </form>
          <p className="mt-3 text-sm text-muted-foreground">Free to list. Questions? Reply to the message we sent you, or email hello@evntlyapp.com.</p>
        </div>

        <div>
          <ListingPreview draft={found.draft} />
        </div>
      </div>
    </div>
  );
}
