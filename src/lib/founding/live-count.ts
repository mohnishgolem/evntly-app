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
  }).length;
}
