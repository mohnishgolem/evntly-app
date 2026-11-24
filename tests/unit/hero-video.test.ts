import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { PHONE_QUERY, pickHeroSrc, prefersLightweightMedia } from "@/components/hero-video";

describe("prefersLightweightMedia (hero clip skipped)", () => {
  it("skips the clip on Data Saver and slow connections", () => {
    expect(prefersLightweightMedia({ saveData: true, effectiveType: "4g" })).toBe(true);
    for (const t of ["slow-2g", "2g", "3g"]) expect(prefersLightweightMedia({ effectiveType: t })).toBe(true);
  });

  it("plays it on fast connections and where the browser doesn't say", () => {
    expect(prefersLightweightMedia({ effectiveType: "4g" })).toBe(false);
    expect(prefersLightweightMedia({})).toBe(false);
    expect(prefersLightweightMedia(undefined)).toBe(false);
  });
});

describe("pickHeroSrc (lighter clip on phones)", () => {
  const full = "/videos/hero-celebrations.mp4";
  const mobile = "/videos/hero-celebrations-phone.mp4";

  it("serves the phone encode only to phones", () => {
    expect(pickHeroSrc(full, mobile, (q) => q === PHONE_QUERY)).toBe(mobile);
    expect(pickHeroSrc(full, mobile, () => false)).toBe(full);
    expect(pickHeroSrc(full, undefined, () => true)).toBe(full);
  });

  it("ships a mobile file that is much smaller than the full clip", () => {
    for (const f of [full, mobile]) expect(existsSync(`public${f}`)).toBe(true);
    expect(statSync(`public${mobile}`).size).toBeLessThan(statSync(`public${full}`).size * 0.6);
  });
});
