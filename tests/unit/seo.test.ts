import { describe, expect, it } from "vitest";
import { HIDDEN_CATEGORIES, LAUNCH_CATEGORIES, SITE_URL } from "@/lib/config";
import { CANONICAL_HOST, isNonCanonicalHost } from "@/lib/canonical-host";
import { serializeJsonLd } from "@/lib/json-ld";
import { LIVE_CATEGORY_SLUGS, isUnknownCategoryPage } from "@/lib/category-page-paths";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  categoryDescription,
  categoryFromSlug,
  categoryPageEntries,
  categoryPages,
  categoryPath,
  categoryTips,
  exploreMetadata,
  listingLocalities,
  metaDescription,
  organizationJsonLd,
  parseLocality,
  serviceAreas,
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

  it("gives every category page a search-length title and description", () => {
    for (const p of categoryPages()) {
      // "<Heading> in Sydney | Evntly" fits Google's ~60-character title.
      expect(`${p.heading} in Sydney | Evntly`.length).toBeLessThanOrEqual(60);
      expect(`${p.title} in Sydney | Evntly`.length).toBeLessThanOrEqual(60);
      expect(categoryTips(p.category).length).toBeGreaterThanOrEqual(3);
      const d = categoryDescription(p.category);
      expect(d.length).toBeLessThanOrEqual(160);
      expect(d.length).toBeGreaterThan(70);
      // Lower-casing headings produced "Compare djs in Sydney".
      expect(d).not.toMatch(/\b(djs|mcs)\b/);
    }
  });

  it("keeps the proxy's slug list in step with the live categories", () => {
    expect([...LIVE_CATEGORY_SLUGS]).toEqual(categoryPages().map((p) => p.slug));
  });

  it("sends a real 404 for unknown category slugs only", () => {
    for (const p of categoryPages()) expect(isUnknownCategoryPage(p.path)).toBe(false);
    expect(isUnknownCategoryPage("/sydney/djs/")).toBe(false);
    for (const path of ["/sydney/venues", "/sydney/nope", "/sydney/%E0%A4%A"]) expect(isUnknownCategoryPage(path)).toBe(true);
    for (const path of ["/sydney", "/sydney/djs/x", "/explore", "/vendor/djs"]) expect(isUnknownCategoryPage(path)).toBe(false);
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

describe("vendor search snippets", () => {
  it("cuts long bios at a word boundary for the meta description", () => {
    const bio = "We are a Sydney wedding DJ team ".repeat(20);
    const d = metaDescription(bio);
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toMatch(/\s…$/);
    expect(metaDescription("  Short   bio. ")).toBe("Short bio.");
  });

  it("turns free-text cities into a suburb and postcode", () => {
    expect(parseLocality("Penrith, NSW 2750")).toEqual({ locality: "Penrith", postcode: "2750" });
    expect(parseLocality("2100")).toEqual({ locality: "Sydney", postcode: "2100" });
    expect(parseLocality("Sydney, NSW")).toEqual({ locality: "Sydney", postcode: null });
    expect(parseLocality("Ryde")).toEqual({ locality: "Ryde", postcode: null });
    expect(parseLocality(null)).toEqual({ locality: null, postcode: null });
  });

  it("tidies a vendor's service areas without inventing any", () => {
    expect(serviceAreas([" manly", "Manly", "Inner West", "", "north shore"])).toEqual(["Manly", "Inner West", "North Shore"]);
    expect(serviceAreas(null)).toEqual([]);
  });

  it("lists distinct real suburbs for a category page, skipping samples", () => {
    expect(
      listingLocalities([
        { city: "Parramatta, NSW 2150", is_demo: false },
        { city: "parramatta", is_demo: false },
        { city: "Bondi", is_demo: true },
        { city: "2100", is_demo: false },
      ])
    ).toEqual(["Parramatta", "Sydney"]);
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
    expect(m.title).toBe("Browse Event Vendors in Sydney");
    expect(m.robots).toBeUndefined();
  });

  it("points a lone category filter at the category landing page", () => {
    const m = exploreMetadata({ category: "dj" });
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/sydney/djs`);
    expect(m.title).toBe("DJs for Hire in Sydney");
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
    expect(vendorJsonLd({ ...vendor, city: "Penrith, NSW 2750" }).address).toMatchObject({ addressLocality: "Penrith", postalCode: "2750" });
  });

  it("uses the vendor's own service areas when given", () => {
    expect(vendorJsonLd({ ...vendor, locations_serviced: ["Inner West", "inner west", "Bondi"] }).areaServed).toEqual([
      { "@type": "Place", name: "Inner West" },
      { "@type": "Place", name: "Bondi" },
    ]);
    expect(vendorJsonLd(vendor).areaServed).toMatchObject({ "@type": "City", name: "Sydney" });
  });
});
