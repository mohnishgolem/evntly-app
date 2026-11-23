import { isListingComplete } from "@/lib/listing-completion";
import { isTestVendorAccount } from "@/lib/acquisition/test-accounts";

// The "N Sydney vendors already listed" number on /founding-vendors. Pure, so
// the rule can be tested without a database.

export type GenuineCountListing = { name: string | null; owner_user_id: string | null; is_demo: boolean | null };
export type GenuineCountOwner = { id: string; role: string | null; email: string | null; suspended_at?: string | null };

/** Approved listings that are genuine: a known, unsuspended owner who isn't a test account. */
export function countGenuineLiveListings(
  listings: GenuineCountListing[],
  owners: GenuineCountOwner[],
  applications: { user_id: string | null; campaign: string | null }[]
): number {
  return genuineLiveListings(listings, owners, applications).length;
}

/** The listings countGenuineLiveListings counts (same rules). */
export function genuineLiveListings<L extends GenuineCountListing>(
  listings: L[],
  owners: GenuineCountOwner[],
  applications: { user_id: string | null; campaign: string | null }[]
): L[] {
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const campaignByUser = new Map(applications.map((a) => [a.user_id, a.campaign]));
  return listings.filter((l) => {
    const owner = l.owner_user_id ? ownerById.get(l.owner_user_id) : undefined;
    if (!owner || owner.suspended_at) return false;
    return !isTestVendorAccount({
      role: owner.role,
      email: owner.email,
      isDemo: l.is_demo,
      campaign: campaignByUser.get(owner.id) ?? null,
      listingName: l.name,
    });
  });
}

/**
 * Real, complete listings to show as proof on the Founding Vendors page
 * (onboarding review item 3): genuine (as above), with a photo for the card,
 * and complete (3 photos and an active package), newest first.
 */
export function pickProofListings<L extends GenuineCountListing & { id: string; avatar_url: string | null }>(
  listings: L[],
  owners: GenuineCountOwner[],
  applications: { user_id: string | null; campaign: string | null }[],
  counts: { photos: { provider_id: string }[]; packages: { provider_id: string }[] },
  limit = 3
): L[] {
  const count = (rows: { provider_id: string }[], id: string) => rows.filter((r) => r.provider_id === id).length;
  return genuineLiveListings(listings, owners, applications)
    .filter((l) => !!l.avatar_url && isListingComplete({ photos: count(counts.photos, l.id), packages: count(counts.packages, l.id) }))
    .slice(0, limit);
}
