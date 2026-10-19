import { describe, expect, it } from "vitest";
import { pageViewFor } from "@/lib/page-views";

describe("funnel page views", () => {
  it("counts the key public pages", () => {
    expect(pageViewFor("/")).toEqual({ kind: "home" });
    expect(pageViewFor("/explore")).toEqual({ kind: "explore" });
    expect(pageViewFor("/plan")).toEqual({ kind: "plan" });
    expect(pageViewFor("/vendor-signup")).toEqual({ kind: "vendor_signup" });
    expect(pageViewFor("/bundles/abc")).toEqual({ kind: "bundles" });
    expect(pageViewFor("/vendor/4e3d8cbe-f7f1-4053-aa6f-bc838c990cd8")).toEqual({
      kind: "vendor",
      vendorId: "4e3d8cbe-f7f1-4053-aa6f-bc838c990cd8",
    });
  });

  it("ignores private and other pages", () => {
    for (const p of ["/messages", "/dashboard", "/admin", "/profile", "/vendor/not-an-id", "/vendor-dashboard"]) {
      expect(pageViewFor(p)).toBeNull();
    }
  });
});
