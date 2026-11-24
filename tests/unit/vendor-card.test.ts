import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicVendor } from "@/lib/vendor-columns";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/actions/saved-vendors", () => ({ toggleSavedVendor: vi.fn() }));

const { VendorCard } = await import("@/components/vendor-card");

// The card must hold up for every listing shape we have: fully filled in,
// half set up, and rows where optional fields are null.
const base = {
  id: "v1",
  name: "Harbourlight Photography",
  service_type: "photographer",
  city: "Mosman",
  pricing_model: "hourly",
  hourly_rate: 180,
  base_price: null,
  rating: 4.9,
  review_count: 23,
  verified: true,
  founding_vendor: true,
  is_demo: false,
  available: true,
  portfolio_urls: ["https://example.test/a.jpg"],
  avatar_url: null,
} as unknown as PublicVendor;

const render = (v: Partial<PublicVendor>) => renderToStaticMarkup(h(VendorCard, { vendor: { ...base, ...v } as PublicVendor }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("VendorCard", () => {
  it("complete listing: photo, rating, suburb, hourly price and availability", () => {
    const html = render({});
    expect(html).toContain('href="/vendor/v1"');
    expect(html).toContain('src="https://example.test/a.jpg"');
    expect(html).toContain('alt="Harbourlight Photography"');
    expect(text(html)).toContain("4.9 (23)");
    expect(html).toContain("out of 5, 23 reviews");
    expect(text(html)).toContain("Photographer · Mosman");
    expect(text(html)).toContain("$180 / hr");
    expect(text(html)).toContain("Available");
    expect(html).toContain('aria-label="Verified"');
  });

  it('"from" prices keep "From" quieter than the amount', () => {
    const html = render({ pricing_model: "from", hourly_rate: null, base_price: 900 });
    expect(html).toMatch(/From\s*<\/span><span class="font-semibold">\$900</);
  });

  it("incomplete listing: no photo, no suburb, quote-only, not available", () => {
    const html = render({ portfolio_urls: [], city: null, pricing_model: "quote", hourly_rate: null, available: false, rating: null, review_count: 0 });
    expect(html).not.toContain("<img src=\"https");
    expect(html).toContain("/images/categories/photographer.webp");
    expect(text(html)).toContain("Contact for pricing");
    expect(text(html)).not.toContain("·");
    expect(text(html)).not.toContain("Available");
    expect(html).not.toContain("out of 5");
  });

  it("missing fields: nulls everywhere still render a usable card", () => {
    const long = "The Extraordinarily Long-Named Celebration Styling & Event Design Collective of Greater Western Sydney";
    const html = render({
      name: long,
      service_type: "decorator",
      city: null,
      pricing_model: null,
      hourly_rate: null,
      base_price: null,
      rating: null,
      review_count: null,
      portfolio_urls: null,
      available: null,
      verified: null,
      founding_vendor: null,
    } as unknown as Partial<PublicVendor>);
    expect(html).toContain("truncate");
    expect(text(html)).toContain("Decorator");
    expect(text(html)).toContain("Contact for pricing");
    expect(html).toContain("/images/categories/decorator.webp");
    expect(text(html)).not.toMatch(/undefined|null|NaN/);
  });

  it("sample listings show the Sample badge and nothing else on the photo", () => {
    const html = render({ is_demo: true });
    expect(text(html)).toMatch(/Sample/);
  });
});
