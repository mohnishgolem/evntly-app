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
