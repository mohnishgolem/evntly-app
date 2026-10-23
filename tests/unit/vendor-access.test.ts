import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Hiding tabs isn't security: every vendor page must check the visitor owns
// a listing (requireVendor) on the server. The two exceptions handle that
// themselves: Home shows "create a listing" to non-vendors, and the listing
// editor 404s unless the listing is the caller's own.
const ROOT = join(process.cwd(), "src/app/vendor-dashboard");
const SELF_CHECKED = new Set(["page.tsx", "edit/[id]/page.tsx"]);

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

describe("vendor pages check the vendor on the server", () => {
  it.each(pages(ROOT).map((p) => relative(ROOT, p)).filter((p) => !SELF_CHECKED.has(p)))("%s", (page) => {
    expect(readFileSync(join(ROOT, page), "utf8")).toMatch(/await requireVendor\(/);
  });

  it("the listing editor only loads the caller's own listing", () => {
    expect(readFileSync(join(ROOT, "edit/[id]/page.tsx"), "utf8")).toMatch(/my_service_providers[\s\S]*notFound\(\)/);
  });
});
