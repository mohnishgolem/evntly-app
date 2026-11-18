import { describe, expect, it } from "vitest";
import { prefersLightweightMedia } from "@/components/hero-video";

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
