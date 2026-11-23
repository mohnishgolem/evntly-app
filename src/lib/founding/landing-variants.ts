// Category versions of the /founding-vendors headline, chosen by ?cat=. Each
// mirrors the hook of a Meta ad (Meta Ads V2, Nov 2026) so the page a vendor
// lands on says what the ad said. Every line must stay true: no promises of
// enquiries, bookings or earnings.

export type LandingVariant = {
  /** Category used for the sample listing card. */
  category: string;
  eyebrow: string;
  /** Null keeps the page's default headline. */
  headline: string | null;
  /**
   * Proof-first layout (onboarding review item 3, utm_content v6_…): the fee
   * promise sits right under the buttons and up to three real, complete
   * listings are shown. Same approved headline, so no new ad copy is needed.
   */
  proof?: boolean;
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

// Meta V5 ads (Nov 2026) all link with ?cat=<category>&utm_content=v5a_… or
// v5b_…. The headline repeats the ad's own headline so the page says what
// the ad said; ?cat= still picks the eyebrow and sample category. Approved ad
// copy only: keep these word for word in step with the live ads.
const AD_HEADLINES: { prefix: string; headline: string }[] = [
  { prefix: "v5b_", headline: "Free listing for Sydney event vendors" },
  { prefix: "v5a_", headline: "Your next booking could start here" },
];

function first(value: string | string[] | undefined): string {
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim().toLowerCase();
}

/** utm_content prefix for the proof-first test (point one ad set at it). */
export const PROOF_VARIANT_PREFIX = "v6_";

/** The variant for ?cat= (and the ad headline for utm_content), or null for the default page. */
export function landingVariant(params: Record<string, string | string[] | undefined>): LandingVariant | null {
  const key = first(params.cat);
  const base = Object.hasOwn(VARIANTS, key) ? VARIANTS[key] : null;
  const content = first(params.utm_content) || first(params.c);
  if (content.startsWith(PROOF_VARIANT_PREFIX)) {
    return {
      category: base?.category ?? "photographer",
      eyebrow: base?.eyebrow ?? "Founding Vendors · Sydney",
      headline: base?.headline ?? null,
      proof: true,
    };
  }
  const ad = AD_HEADLINES.find((a) => content.startsWith(a.prefix));
  if (!ad) return base;
  return {
    category: base?.category ?? "photographer",
    eyebrow: base?.eyebrow ?? "Founding Vendors · Sydney",
    headline: ad.headline,
  };
}
