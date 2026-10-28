import { describe, expect, it } from "vitest";
import { isBookingReturn, safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath (open-redirect protection)", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/vendor-dashboard/quotes?tab=new#top", "/vendor-dashboard/quotes?tab=new#top"],
    ["/reset-password", "/reset-password"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "@evil.com", // `${origin}@evil.com` → userinfo + host evil.com
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/\t/evil.com",
    "/\n/evil.com",
    "evil.com",
    "",
    "/" + "a".repeat(600),
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBe("/dashboard");
  });

  it("uses the supplied fallback", () => {
    expect(safeNextPath(null, "/")).toBe("/");
  });
});

describe("isBookingReturn", () => {
  it("recognises a return to a vendor's booking form", () => {
    expect(isBookingReturn("/vendor/abc?book=1")).toBe(true);
    expect(isBookingReturn("/vendor/abc?ref=x&book=1")).toBe(true);
  });

  it("ignores other paths and anything off-site", () => {
    expect(isBookingReturn("/vendor/abc")).toBe(false);
    expect(isBookingReturn("/vendor/abc?book=10")).toBe(false);
    expect(isBookingReturn("/dashboard?book=1")).toBe(false);
    expect(isBookingReturn("//evil.com/vendor/abc?book=1")).toBe(false);
    expect(isBookingReturn(undefined)).toBe(false);
  });
});
