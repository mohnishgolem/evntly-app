import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

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
