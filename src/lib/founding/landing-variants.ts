// Category versions of the /founding-vendors headline, chosen by ?cat=. Each
// mirrors the hook of a Meta ad (Meta Ads V2, Nov 2026) so the page a vendor
// lands on says what the ad said. Every line must stay true: no promises of
// enquiries, bookings or earnings.

export type LandingVariant = {
  /** Category used for the sample listing card. */
  category: string;
  eyebrow: string;
  headline: string;
};

const VARIANTS: Record<string, LandingVariant> = {
  photographer: {
    category: "photographer",
    eyebrow: "For Sydney photographers and videographers",
    headline: "Get enquiries with the details up front, not another DM thread",
  },
  videographer: {
    category: "photographer",
    eyebrow: "For Sydney photographers and videographers",
    headline: "Get enquiries with the details up front, not another DM thread",
  },
  // Mirrors the DJ ad (B-dj): "most of your bookings probably come from
  // referrals … somewhere to find you when the referral isn't there".
  dj: {
    category: "dj",
    eyebrow: "For Sydney DJs and entertainers",
    headline: "Get found by Sydney event organisers when the referral isn't there",
  },
  decorator: {
    category: "decorator",
    eyebrow: "For Sydney decorators, stylists and planners",
    headline: "Show your event setups to more Sydney customers",
  },
  planner: {
    category: "decorator",
    eyebrow: "For Sydney decorators, stylists and planners",
    headline: "Show your event setups to more Sydney customers",
  },
};

/** The variant for ?cat=, or null for the default page. */
export function landingVariant(params: Record<string, string | string[] | undefined>): LandingVariant | null {
  const raw = Array.isArray(params.cat) ? params.cat[0] : params.cat;
  const key = raw?.trim().toLowerCase() ?? "";
  return Object.hasOwn(VARIANTS, key) ? VARIANTS[key] : null;
}
