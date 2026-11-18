import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// 19 Nov onboarding fixes on /vendor-dashboard/finish: a starter package
// drafted from the sign-up pricing, a "how customers will see you" preview,
// labelled photo slots and a checklist that says exactly what's next.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/portfolio", () => ({ addPortfolioItem: vi.fn(), deletePortfolioItem: vi.fn() }));
vi.mock("@/lib/actions/vendor-pricing", () => ({ savePackage: vi.fn(), deletePackage: vi.fn(), updateServiceArea: vi.fn() }));
vi.mock("@/lib/actions/listing-completion", () => ({ submitListingForReview: vi.fn(), requestListingSetup: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const { starterPackage, photoTips } = await import("@/lib/listing-guidance");
const { completionSteps, remainingSummary } = await import("@/lib/listing-completion");
const { formatAudPlain, formatAud } = await import("@/lib/payments/money");
const { CompletionChecklist, SubmitForReviewButton } = await import("@/components/listing-completion");
const { PortfolioUploader } = await import("@/components/portfolio-uploader");
const { PackageList } = await import("@/components/vendor-pricing");
const { ListingPreview } = await import("@/components/listing-preview");

const photo = (id: string) => ({ id, provider_id: "p1", media_url: `https://x.test/${id}.jpg`, media_type: "image", caption: null, sort_order: 0 }) as never;

describe("starterPackage", () => {
  it("turns an hourly rate into a typical 4-hour booking with extra hours at the same rate", () => {
    expect(starterPackage({ pricing_model: "hourly", hourly_rate: 150, service_type: "dj" })).toMatchObject({
      name: "4-hour DJ set",
      price: 600,
      includedHours: 4,
      extraHourPrice: 150,
    });
  });

  it("uses a fixed or starting price as one flat package", () => {
    expect(starterPackage({ pricing_model: "fixed", base_price: "800", service_type: "photographer" })).toMatchObject({
      name: "Event photography",
      price: 800,
      includedHours: null,
      extraHourPrice: null,
    });
    expect(starterPackage({ pricing_model: "from", base_price: 450, service_type: "cakes_desserts" }).price).toBe(450);
  });

  it("leaves the price for the vendor when they quote, or the amount is missing", () => {
    expect(starterPackage({ pricing_model: "quote", base_price: 900, service_type: "mc" })).toMatchObject({ name: "Event MC package", price: null });
    expect(starterPackage({ pricing_model: "hourly", hourly_rate: null, service_type: "dj" })).toMatchObject({ name: "Party DJ package", price: null });
  });

  it("falls back to generic wording for unknown categories and old rows without a model", () => {
    const s = starterPackage({ hourly_rate: 100, service_type: "juggler" });
    expect(s).toMatchObject({ name: "4-hour booking", price: 400 });
    expect(s.inclusionExample.length).toBeGreaterThan(0);
  });

  it("never pre-fills inclusions: they're only a placeholder the vendor writes over", () => {
    expect(Object.keys(starterPackage({ pricing_model: "fixed", base_price: 1 }))).not.toContain("inclusions");
  });
});

describe("photoTips", () => {
  it("gives 3 category-specific prompts, with a generic fallback", () => {
    expect(photoTips("dj")).toEqual(["You behind the decks", "A packed dance floor", "Your setup and lighting"]);
    expect(photoTips(null)).toHaveLength(3);
    expect(photoTips("unknown")).toEqual(photoTips(undefined));
  });
});

describe("remainingSummary", () => {
  it("says exactly what is left", () => {
    expect(remainingSummary({ photos: 0, packages: 0 })).toBe("3 photos and a package");
    expect(remainingSummary({ photos: 2, packages: 0 })).toBe("1 more photo and a package");
    expect(remainingSummary({ photos: 1, packages: 1 })).toBe("2 more photos");
    expect(remainingSummary({ photos: 5, packages: 0 })).toBe("a package");
    expect(remainingSummary({ photos: 3, packages: 1 })).toBeNull();
  });
});

describe("formatAudPlain (no Intl in client components)", () => {
  it("matches the Intl formatter for whole and fractional amounts", () => {
    for (const cents of [0, 5, 65000, 123450, 100000000, 99]) expect(formatAudPlain(cents)).toBe(formatAud(cents));
  });
});

describe("CompletionChecklist", () => {
  const html = renderToStaticMarkup(h(CompletionChecklist, { steps: completionSteps({ photos: 1, packages: 0, status: "draft" }) }));

  it("links unfinished steps to where they're done on the page", () => {
    expect(html).toContain('href="#photos"');
    expect(html).toContain('href="#packages"');
  });

  it("marks only the first unfinished step as next", () => {
    expect(html.match(/>Next</g)).toHaveLength(1);
    expect(html.indexOf(">Next<")).toBeGreaterThan(html.indexOf("photos of your work"));
    expect(html.indexOf(">Next<")).toBeLessThan(html.indexOf("Add at least one package"));
  });
});

describe("SubmitForReviewButton", () => {
  it("names what's missing while the listing is incomplete", () => {
    const html = renderToStaticMarkup(h(SubmitForReviewButton, { providerId: "p1", remaining: "1 more photo and a package" }));
    expect(html).toContain("Add 1 more photo and a package to submit.");
    expect(html).toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("celebrates and enables submit once complete", () => {
    const html = renderToStaticMarkup(h(SubmitForReviewButton, { providerId: "p1", remaining: null }));
    expect(html).toContain("Your listing is ready.");
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/);
  });
});

describe("PortfolioUploader photo slots", () => {
  const tips = ["Tip A", "Tip B", "Tip C"] as const;

  it("shows one labelled slot per missing photo, continuing after the ones added", () => {
    const html = renderToStaticMarkup(h(PortfolioUploader, { providerId: "p1", userId: "u1", items: [photo("a")], tips }));
    expect(html).toContain("2 more to go.");
    expect(html).not.toContain("Tip A");
    expect(html).toContain("Photo 2");
    expect(html).toContain("Tip B");
    expect(html).toContain("Tip C");
  });

  it("asks for all 3 when empty and stops showing slots once there are 3", () => {
    expect(renderToStaticMarkup(h(PortfolioUploader, { providerId: "p1", userId: "u1", items: [], tips }))).toContain("Add 3 photos");
    const full = renderToStaticMarkup(h(PortfolioUploader, { providerId: "p1", userId: "u1", items: [photo("a"), photo("b"), photo("c")], tips }));
    expect(full).not.toContain("Tip C");
    expect(full).not.toContain("more to go");
  });

  it("keeps the remove button reachable on touch screens and labelled", () => {
    const html = renderToStaticMarkup(h(PortfolioUploader, { providerId: "p1", userId: "u1", items: [photo("a")] }));
    expect(html).toContain('aria-label="Remove this photo"');
    // Hidden only for fine pointers (mouse), never by default.
    expect(html).toContain("pointer-fine:opacity-0");
    expect(html).not.toMatch(/class="[^"]*(?<!:)\bopacity-0\b/);
  });
});

describe("PackageList starter package", () => {
  const listing = { pricing_model: "hourly", hourly_rate: 150 };
  const starter = starterPackage({ ...listing, service_type: "dj" });

  it("offers the drafted package instead of a blank form when there are none", () => {
    const html = renderToStaticMarkup(h(PackageList, { listingId: "p1", listing, packages: [], starter }));
    expect(html).toContain("Drafted from your listing");
    expect(html).toContain("4-hour DJ set");
    expect(html).toContain("$600 · 4 hrs · extra hours $150");
    expect(html).toContain("Check and save this package");
    expect(html).toContain("Start from blank");
    expect(html).not.toContain("Add package");
  });

  it("goes back to the normal list once a package exists", () => {
    const pkg = { id: "k1", provider_id: "p1", name: "Gold", description: null, price_cents: 123450, included_hours: null, extra_hour_cents: null, inclusions: [], delivery_days: null, deposit_percent: null, active: true, sort_order: 0 };
    const html = renderToStaticMarkup(h(PackageList, { listingId: "p1", listing, packages: [pkg], starter }));
    expect(html).not.toContain("Drafted from your listing");
    expect(html).toContain("$1,234.50");
    expect(html).toContain("Add package");
  });
});

describe("ListingPreview", () => {
  const base = { name: "DJ Test", category: "DJ", city: "Sydney", priceLabel: "$150/hr", firstPackage: null, complete: false };

  it("shows empty photo and package slots that jump to where they're added", () => {
    const html = renderToStaticMarkup(h(ListingPreview, { ...base, photos: [photo("a")], offerSetup: true }));
    expect(html).toContain("How customers will see you");
    expect(html).toContain("DJ · Sydney · $150/hr");
    expect(html.match(/href="#photos"/g)).toHaveLength(2);
    expect(html).toContain("Your first package shows here");
    expect(html).toContain('href="#setup"');
  });

  it("shows the real package and no setup offer once complete", () => {
    const html = renderToStaticMarkup(
      h(ListingPreview, { ...base, photos: [photo("a"), photo("b"), photo("c")], firstPackage: "4-hour DJ set · $600 · 4 hrs", complete: true, offerSetup: true })
    );
    expect(html).toContain("4-hour DJ set · $600 · 4 hrs");
    expect(html).not.toContain('href="#photos"');
    expect(html).not.toContain('href="#setup"');
    expect(html).toContain("Looking good");
  });
});
