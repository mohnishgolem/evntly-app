import { describe, expect, it } from "vitest";
import { landingVariant } from "@/lib/founding/landing-variants";

describe("founding landing variants (?cat=)", () => {
  it("matches each Meta V2 ad's category", () => {
    expect(landingVariant({ cat: "photographer" })?.headline).toMatch(/details up front/);
    expect(landingVariant({ cat: "videographer" })?.category).toBe("photographer");
    expect(landingVariant({ cat: "DJ" })?.headline).toMatch(/event organisers to find you/);
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
