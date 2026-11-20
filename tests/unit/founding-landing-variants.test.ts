import { describe, expect, it } from "vitest";
import { landingVariant } from "@/lib/founding/landing-variants";

describe("founding landing variants (?cat=)", () => {
  it("matches each Meta V2 ad's category", () => {
    expect(landingVariant({ cat: "photographer" })?.headline).toMatch(/details up front/);
    expect(landingVariant({ cat: "videographer" })?.category).toBe("photographer");
    expect(landingVariant({ cat: "DJ" })?.headline).toMatch(/when the referral isn.t there/);
    expect(landingVariant({ cat: "decorator" })?.headline).toMatch(/event setups/);
    expect(landingVariant({ cat: ["planner", "dj"] })?.category).toBe("decorator");
  });

  it("falls back to the default page for anything else", () => {
    for (const cat of [undefined, "", "toString", "__proto__", "florist<script>"]) expect(landingVariant({ cat })).toBeNull();
  });

  it("never promises results", () => {
    for (const cat of ["photographer", "dj", "decorator"]) {
      const v = landingVariant({ cat })!;
      expect(`${v.eyebrow} ${v.headline}`).not.toMatch(/guarantee|bookings|earn|\d+ (enquiries|customers)/i);
    }
  });
});

describe("founding landing variants (Meta V5 ad headlines)", () => {
  it("repeats the ad's headline and keeps the category eyebrow", () => {
    const b = landingVariant({ cat: "dj", utm_content: "v5b_dj" })!;
    expect(b.headline).toBe("Free listing for Sydney event vendors");
    expect(b.eyebrow).toMatch(/DJs/);
    expect(landingVariant({ cat: "photographer", utm_content: "V5A_photo" })?.headline).toBe("Your next booking could start here");
    expect(landingVariant({ c: "v5b_decor" })?.headline).toBe("Free listing for Sydney event vendors");
  });

  it("ignores other campaign tags", () => {
    expect(landingVariant({ cat: "dj", utm_content: "b_dj" })?.headline).toMatch(/referral/);
    expect(landingVariant({ utm_content: "qa_audit" })).toBeNull();
  });
});

describe("the six live V5 ad links", () => {
  it("each lands on its ad's headline, its category eyebrow and the meta_ads source", async () => {
    const { sourceFromParams, campaignFromParams } = await import("@/lib/founding/sources");
    const cases = [
      ["photographer", "v5b_photo", "Free listing for Sydney event vendors", /photographers/],
      ["photographer", "v5a_photo", "Your next booking could start here", /photographers/],
      ["dj", "v5b_dj", "Free listing for Sydney event vendors", /DJs/],
      ["dj", "v5a_dj", "Your next booking could start here", /DJs/],
      ["decorator", "v5b_decor", "Free listing for Sydney event vendors", /decorators/],
      ["decorator", "v5a_decor", "Your next booking could start here", /decorators/],
    ] as const;
    for (const [cat, content, headline, eyebrow] of cases) {
      const p = { cat, utm_source: "meta", utm_medium: "paid", utm_campaign: "fv_v5", utm_content: content };
      expect(landingVariant(p)?.headline).toBe(headline);
      expect(landingVariant(p)?.eyebrow).toMatch(eyebrow);
      expect(sourceFromParams(p)).toBe("meta_ads");
      expect(campaignFromParams(p)).toBe(content);
    }
  });
});
