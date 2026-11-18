import { describe, expect, it } from "vitest";
import { HIDDEN_CATEGORIES, LAUNCH_CATEGORIES, SITE_URL } from "@/lib/config";
import { CANONICAL_HOST, isNonCanonicalHost } from "@/lib/canonical-host";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  categoryFromSlug,
  categoryPageEntries,
  categoryPages,
  categoryPath,
  exploreMetadata,
  organizationJsonLd,
  pageMetadata,
  realListings,
  vendorItemListJsonLd,
  vendorJsonLd,
  websiteJsonLd,
} from "@/lib/seo";

describe("pageMetadata", () => {
  const meta = pageMetadata({ title: "How it works", description: "d", path: "/how-it-works" });

  it("sets canonical and og:url to the page itself, not the home page", () => {
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/how-it-works`);
    expect(meta.openGraph).toMatchObject({ url: `${SITE_URL}/how-it-works`, title: "How it works | Evntly", locale: "en_AU" });
    expect(meta.twitter).toMatchObject({ title: "How it works | Evntly", description: "d" });
  });

  it("uses the bare origin for the home page", () => {
    expect(absoluteUrl("/")).toBe(SITE_URL);
    expect(pageMetadata({ title: "t", description: "d", path: "/" }).alternates?.canonical).toBe(SITE_URL);
  });
});

describe("canonical host", () => {
  it("matches SITE_URL", () => {
    expect(new URL(SITE_URL).host).toBe(CANONICAL_HOST);
  });

  it("flags the legacy Vercel address and previews, not production or local dev", () => {
    expect(isNonCanonicalHost("evntly-tau.vercel.app")).toBe(true);
    expect(isNonCanonicalHost("evntly-git-feature-x.vercel.app")).toBe(true);
    expect(isNonCanonicalHost("evntlyapp.com")).toBe(false);
    expect(isNonCanonicalHost("EvntlyApp.com:443")).toBe(false);
    expect(isNonCanonicalHost("localhost:3000")).toBe(false);
    expect(isNonCanonicalHost(null)).toBe(false);
  });
});

describe("category landing pages", () => {
  it("has one page per live category, none for hidden ones", () => {
    const pages = categoryPages();
    expect(pages.map((p) => p.category)).toEqual(LAUNCH_CATEGORIES);
    for (const hidden of HIDDEN_CATEGORIES) expect(pages.some((p) => p.category === hidden)).toBe(false);
    expect(categoryFromSlug("venues")).toBeNull();
  });

  it("uses unique, URL-safe slugs that round-trip", () => {
    const slugs = categoryPages().map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of categoryPages()) {
      expect(p.slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(categoryFromSlug(p.slug)).toBe(p.category);
    }
    expect(categoryPath("dj")).toBe("/sydney/djs");
    expect(categoryPath("cakes_desserts")).toBe("/sydney/cakes-desserts");
    expect(categoryFromSlug("nope")).toBeNull();
  });

  it("lists only categories with listings in the sitemap, dated by the newest", () => {
    const entries = categoryPageEntries([
      { service_type: "dj", updated_at: "2026-11-01T00:00:00Z" },
      { service_type: "dj", updated_at: "2026-11-10T00:00:00Z" },
      { service_type: "photographer", updated_at: null },
      { service_type: "venue", updated_at: "2026-11-12T00:00:00Z" },
    ]);
    expect(entries).toEqual([
      { path: "/sydney/photographers", lastModified: undefined },
      { path: "/sydney/djs", lastModified: "2026-11-10T00:00:00Z" },
    ]);
  });
});

describe("realListings", () => {
  it("drops sample listings so they never make a page indexable", () => {
    const list = [
      { id: "s", is_demo: true },
      { id: "r", is_demo: false },
      { id: "n", is_demo: null },
    ];
    expect(realListings(list).map((v) => v.id)).toEqual(["r", "n"]);
    expect(realListings([{ id: "s", is_demo: true }])).toEqual([]);
  });
});

describe("exploreMetadata", () => {
  it("indexes the plain page with its own canonical", () => {
    const m = exploreMetadata({});
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/explore`);
    expect(m.robots).toBeUndefined();
  });

  it("points a lone category filter at the category landing page", () => {
    const m = exploreMetadata({ category: "dj" });
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/sydney/djs`);
    expect(m.title).toBe("DJs in Sydney");
    expect(m.robots).toBeUndefined();
  });

  it("keeps search terms and filter combinations out of the index", () => {
    for (const params of [{ q: "parramatta" }, { category: "dj", price: "50-100" }, { event: "Birthday" }, { category: "venue" }]) {
      expect(exploreMetadata(params).robots).toEqual({ index: false, follow: true });
    }
  });
});

describe("JSON-LD", () => {
  it("describes Evntly as an organisation serving Sydney, linked to its Instagram", () => {
    const org = organizationJsonLd();
    expect(org).toMatchObject({ "@type": "Organization", name: "Evntly", url: SITE_URL });
    expect(org.sameAs).toContain("https://www.instagram.com/evntly.au/");
    // A marketplace with no shopfront: no street address or phone is claimed.
    expect(org).not.toHaveProperty("address");
    expect(org).not.toHaveProperty("telephone");
    expect(websiteJsonLd().publisher).toEqual({ "@id": org["@id"] });
  });

  it("numbers breadcrumbs and item lists with absolute URLs", () => {
    const crumbs = breadcrumbJsonLd([
      { name: "Evntly", path: "/" },
      { name: "DJs in Sydney", path: "/sydney/djs" },
    ]);
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Evntly", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "DJs in Sydney", item: `${SITE_URL}/sydney/djs` },
    ]);
    const list = vendorItemListJsonLd("DJs in Sydney", [{ id: "a", name: "A" }]);
    expect(list.itemListElement[0]).toMatchObject({ position: 1, url: `${SITE_URL}/vendor/a` });
  });

  const vendor = {
    id: "v1",
    name: "</script><script>alert(1)</script>",
    bio: "Balloon styling",
    avatar_url: null,
    city: "Parramatta",
    service_type: "decorator",
    rating: 4.8,
    review_count: 0,
  };

  it("only claims a rating when the vendor has reviews", () => {
    expect(vendorJsonLd(vendor)).not.toHaveProperty("aggregateRating");
    expect(vendorJsonLd({ ...vendor, review_count: 3 }).aggregateRating).toMatchObject({ ratingValue: 4.8, reviewCount: 3 });
  });

  it("uses only facts from the listing and stays XSS-safe when serialised", () => {
    const ld = vendorJsonLd(vendor, "$500");
    expect(ld).toMatchObject({
      "@type": "LocalBusiness",
      url: `${SITE_URL}/vendor/v1`,
      priceRange: "$500",
      address: { addressLocality: "Parramatta", addressRegion: "NSW", addressCountry: "AU" },
    });
    expect(ld).not.toHaveProperty("telephone");
    expect(serializeJsonLd([ld])).not.toContain("<");
    expect(vendorJsonLd({ ...vendor, city: null }).address).toBeUndefined();
  });
});
