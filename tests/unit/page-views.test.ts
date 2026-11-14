import { describe, expect, it } from "vitest";
import { pageViewFor, parseSourceParams, sourceParamsFrom } from "@/lib/page-views";

describe("funnel page views", () => {
  it("counts the key public pages", () => {
    expect(pageViewFor("/")).toEqual({ kind: "home" });
    expect(pageViewFor("/explore")).toEqual({ kind: "explore" });
    expect(pageViewFor("/plan")).toEqual({ kind: "plan" });
    expect(pageViewFor("/vendor-signup")).toEqual({ kind: "vendor_signup" });
    expect(pageViewFor("/bundles/abc")).toEqual({ kind: "bundles" });
    expect(pageViewFor("/founding-vendors")).toEqual({ kind: "founding" });
    expect(pageViewFor("/founding-vendors/claim")).toEqual({ kind: "founding_claim" });
    expect(pageViewFor("/vendor/4e3d8cbe-f7f1-4053-aa6f-bc838c990cd8")).toEqual({
      kind: "vendor",
      vendorId: "4e3d8cbe-f7f1-4053-aa6f-bc838c990cd8",
    });
  });

  it("ignores private and other pages", () => {
    for (const p of ["/messages", "/dashboard", "/admin", "/profile", "/vendor/not-an-id", "/vendor-dashboard", "/founding-vendors/unsubscribe"]) {
      expect(pageViewFor(p)).toBeNull();
    }
  });
});

describe("founding source tags on page views", () => {
  it("keeps only the tags that decide the source, trimmed to 40 characters", () => {
    expect(sourceParamsFrom("?cat=photographer&utm_source=meta&utm_medium=paid_social&utm_campaign=fv_v2_nov26&utm_content=a_photo")).toEqual({
      utm_source: "meta",
      utm_medium: "paid_social",
    });
    expect(sourceParamsFrom("?src=instagram_dm&ref=abcd1234")).toEqual({ src: "instagram_dm", ref: "abcd1234" });
    expect(sourceParamsFrom(`?utm_source=${"m".repeat(60)}`)).toEqual({ utm_source: "m".repeat(40) });
    expect(sourceParamsFrom("")).toBeUndefined();
    expect(sourceParamsFrom("?cat=dj")).toBeUndefined();
  });

  it("accepts only known keys with short string values from a request", () => {
    expect(parseSourceParams({ utm_source: "meta", utm_medium: "paid" })).toEqual({ utm_source: "meta", utm_medium: "paid" });
    expect(parseSourceParams({ utm_source: "meta", other: "x" })).toBeNull();
    expect(parseSourceParams({ utm_source: 1 })).toBeNull();
    expect(parseSourceParams({ utm_source: "x".repeat(41) })).toBeNull();
    expect(parseSourceParams(["meta"])).toBeNull();
    expect(parseSourceParams("utm_source=meta")).toBeNull();
    expect(parseSourceParams({})).toBeNull();
    expect(parseSourceParams(null)).toBeNull();
  });
});
