import { describe, expect, it, vi } from "vitest";
import { VENDOR_CATEGORIES } from "@/lib/config";
import { packageSchema } from "@/lib/package-schema";
import { packageTemplatesFor } from "@/lib/package-templates";

// PackageList is a client component; rendering it outside Next needs a router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));

// Onboarding review item 7: starter packages per category, never with a price.
describe("package templates", () => {
  it("has at least one starter package for every category", () => {
    for (const c of VENDOR_CATEGORIES) expect(packageTemplatesFor(c.value).length, c.value).toBeGreaterThan(0);
    expect(packageTemplatesFor("unknown")).toEqual([]);
    expect(packageTemplatesFor(null)).toEqual([]);
    expect(packageTemplatesFor("__proto__")).toEqual([]);
  });

  it("never suggests a price, and is valid once the vendor adds theirs", () => {
    for (const c of VENDOR_CATEGORIES) {
      for (const t of packageTemplatesFor(c.value)) {
        expect(JSON.stringify(t), `${c.value}/${t.label}`).not.toMatch(/\$|\bAUD\b|\bprice from\b/i);
        const parsed = packageSchema.safeParse({
          name: t.name,
          description: t.description,
          price: 500, // the vendor's own price
          includedHours: t.includedHours,
          extraHourPrice: null,
          inclusions: t.inclusions,
          deliveryDays: null,
          depositPercent: null,
          active: true,
        });
        expect(parsed.success, `${c.value}/${t.label}`).toBe(true);
        expect(t.inclusions.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("PackageList starter chips", () => {
  it("offers the category's starter packages only while a listing has none", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PackageList } = await import("@/components/vendor-pricing");
    const listing = { hourly_rate: null, pricing_model: "quote", base_price: null } as never;
    const empty = renderToStaticMarkup(createElement(PackageList, { listingId: "sp-1", listing, packages: [], category: "dj" }));
    expect(empty).toContain("start from a typical package and set your own price");
    for (const t of packageTemplatesFor("dj")) expect(empty).toContain(t.label);
    const pkg = { id: "p1", provider_id: "sp-1", name: "My set", description: null, price_cents: 90000, included_hours: 4, extra_hour_cents: null, inclusions: [], delivery_days: null, deposit_percent: null, active: true, sort_order: 0 };
    const withOne = renderToStaticMarkup(createElement(PackageList, { listingId: "sp-1", listing, packages: [pkg] as never, category: "dj" }));
    expect(withOne).not.toContain("start from a typical package");
    // No category (e.g. the pricing page before it passes one): no chips.
    expect(renderToStaticMarkup(createElement(PackageList, { listingId: "sp-1", listing, packages: [] }))).not.toContain("typical package");
  });
});
