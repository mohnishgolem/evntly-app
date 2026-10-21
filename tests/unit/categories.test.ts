import { describe, expect, it } from "vitest";
import {
  FEATURED_CATEGORIES,
  LAUNCH_CATEGORIES,
  VENDOR_CATEGORIES,
  categoryLabel,
  categoryPlural,
  isLaunchCategory,
  isVendorCategory,
} from "@/lib/config";

describe("launch categories", () => {
  it("feature the Ecosystem Strategy focus set", () => {
    expect(FEATURED_CATEGORIES).toEqual(["photographer", "decorator", "dj", "celebrant", "venue"]);
    for (const c of FEATURED_CATEGORIES) expect(LAUNCH_CATEGORIES).toContain(c);
  });

  it("include every vendor category", () => {
    expect(LAUNCH_CATEGORIES).toEqual(VENDOR_CATEGORIES.map((c) => c.value));
  });

  it("are all known vendor categories with labels", () => {
    for (const c of LAUNCH_CATEGORIES) {
      expect(isVendorCategory(c)).toBe(true);
      expect(categoryLabel(c)).not.toBe(c);
    }
  });

  it("accept only launch values for new listings", () => {
    expect(isLaunchCategory("celebrant")).toBe(true);
    expect(isLaunchCategory("florist")).toBe(true);
    expect(isLaunchCategory("anything")).toBe(false);
    expect(isVendorCategory("anything")).toBe(false);
    expect(isVendorCategory("")).toBe(false);
  });

  it("pluralise for running text", () => {
    expect(categoryPlural("dj")).toBe("DJs");
    expect(categoryPlural("celebrant")).toBe("celebrants");
    expect(categoryPlural("venue")).toBe("venues");
  });
});
