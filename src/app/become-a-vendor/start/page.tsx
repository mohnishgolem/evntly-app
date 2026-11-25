import type { Metadata } from "next";
import { ListingBuilder } from "@/components/vendor-journey/listing-builder";
import { SourceCookie } from "@/components/founding/source-cookie";
import { campaignFromParams, referralFromParams, sourceFromParams } from "@/lib/founding/sources";
import { getCurrentUser } from "@/lib/data/user";
import { draftFromCookie } from "@/lib/vendor-journey/server";

export const metadata: Metadata = {
  title: "Build your listing",
  // A private, per-visitor page: keep it out of search.
  robots: { index: false, follow: false },
};

export default async function BuildListingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, session, stored] = await Promise.all([searchParams, getCurrentUser(), draftFromCookie()]);
  const server = stored ? { draft: stored.draft, updatedAt: stored.row.updated_at, origin: stored.row.origin } : null;
  return (
    <>
      {/* Links straight to the builder (Instagram bio, DMs, /founding-vendors) keep their source. */}
      <SourceCookie source={sourceFromParams(params)} referral={referralFromParams(params)} campaign={campaignFromParams(params)} />
      <ListingBuilder server={server} signedIn={!!session} startOnReview={params.review === "1"} />
    </>
  );
}
