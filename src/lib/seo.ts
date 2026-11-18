import type { Metadata } from "next";
import {
  LAUNCH_CATEGORIES,
  LAUNCH_CITY,
  SITE_URL,
  categoryLabel,
  type VendorCategory,
} from "@/lib/config";

// Shared search/social metadata and structured data. Kept free of data
// fetching so it can be unit-tested directly.

export const INSTAGRAM_URL = "https://www.instagram.com/evntly.au/";
export const CONTACT_EMAIL = "hello@evntlyapp.com";

/**
 * Title, description, canonical and matching Open Graph / Twitter tags for a
 * public page. Next.js merges metadata shallowly, so a page that sets only a
 * title would otherwise inherit the root layout's openGraph block — every
 * shared link then previewed as the home page. Build all of them together.
 */
export function pageMetadata({
  title,
  description,
  path,
  socialTitle,
  type = "website",
}: {
  title: string;
  description: string;
  /** Site-relative path, e.g. "/how-it-works". */
  path: string;
  /** Title for link previews; defaults to `title` plus the brand. */
  socialTitle?: string;
  type?: "website" | "profile" | "article";
}): Metadata {
  const url = absoluteUrl(path);
  const shareTitle = socialTitle ?? `${title} | Evntly`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: shareTitle, description, url, type, siteName: "Evntly", locale: "en_AU" },
    twitter: { card: "summary_large_image", title: shareTitle, description },
  };
}

export function absoluteUrl(path: string) {
  if (path === "/" || path === "") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// ---------------------------------------------------------------------------
// Category landing pages: /sydney/<slug>
// ---------------------------------------------------------------------------

// Plural, title-case names used in headings ("DJs in Sydney").
const CATEGORY_HEADINGS: Record<VendorCategory, string> = {
  photographer: "Photographers",
  decorator: "Event Decorators",
  dj: "DJs",
  celebrant: "Celebrants",
  venue: "Venues",
  florist: "Florists",
  caterer: "Caterers",
  cakes_desserts: "Cakes & Desserts",
  videographer: "Videographers",
  mc: "MCs",
  makeup_artist: "Makeup Artists",
  event_planner: "Event Planners",
};

// URL slugs: plural, hyphenated, matching how people search.
const CATEGORY_SLUGS: Record<VendorCategory, string> = {
  photographer: "photographers",
  decorator: "decorators",
  dj: "djs",
  celebrant: "celebrants",
  venue: "venues",
  florist: "florists",
  caterer: "caterers",
  cakes_desserts: "cakes-desserts",
  videographer: "videographers",
  mc: "mcs",
  makeup_artist: "makeup-artists",
  event_planner: "event-planners",
};

// One factual line per category: what they do at the kinds of events people
// book through Evntly. No claims about vendor counts, prices or quality.
const CATEGORY_INTROS: Record<VendorCategory, string> = {
  photographer: "Capture birthdays, engagements, corporate functions and cultural celebrations with a photographer who knows Sydney's venues.",
  decorator: "Balloon garlands, backdrops, table styling and themed set-ups for birthdays, engagements, baby showers and cultural events.",
  dj: "Keep the dance floor full at your birthday party, engagement, corporate function or cultural celebration.",
  celebrant: "Find a celebrant for your wedding, vow renewal, commitment ceremony or naming day.",
  venue: "Find a venue for your party, function or celebration.",
  florist: "Flowers for engagements, birthdays, corporate events and ceremonies, from table arrangements to statement installations.",
  caterer: "Food for parties, corporate functions and family celebrations, from grazing tables to full-service catering.",
  cakes_desserts: "Custom cakes, dessert tables and sweet treats for birthdays, engagements and every kind of celebration.",
  videographer: "Film your engagement, milestone birthday, corporate event or cultural celebration.",
  mc: "An MC to host your engagement party, milestone birthday, corporate event or cultural celebration.",
  makeup_artist: "Hair and makeup for engagements, formals, parties, photoshoots and cultural celebrations.",
  event_planner: "Hand the planning to someone who does it every week: birthdays, engagements, corporate events and more.",
};

export function categoryHeading(category: VendorCategory) {
  return CATEGORY_HEADINGS[category] ?? categoryLabel(category);
}

export function categoryIntro(category: VendorCategory) {
  return CATEGORY_INTROS[category];
}

export function categorySlug(category: VendorCategory) {
  return CATEGORY_SLUGS[category];
}

/** The live category for a URL slug, or null (hidden categories have no page). */
export function categoryFromSlug(slug: string): VendorCategory | null {
  const match = LAUNCH_CATEGORIES.find((c) => CATEGORY_SLUGS[c] === slug);
  return match ?? null;
}

/** "/sydney/djs" */
export function categoryPath(category: VendorCategory) {
  return `/${LAUNCH_CITY.toLowerCase()}/${CATEGORY_SLUGS[category]}`;
}

/** Every live category page, in display order. */
export function categoryPages() {
  return LAUNCH_CATEGORIES.map((category) => ({
    category,
    slug: CATEGORY_SLUGS[category],
    path: categoryPath(category),
    heading: categoryHeading(category),
  }));
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

const GREATER_SYDNEY = {
  "@type": "City",
  name: LAUNCH_CITY,
  containedInPlace: { "@type": "State", name: "New South Wales" },
};

/** Who runs the site: Evntly, an online marketplace serving Greater Sydney. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Evntly",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    email: CONTACT_EMAIL,
    description: `An online marketplace for booking event vendors in ${LAUNCH_CITY}: photographers, decorators, DJs, celebrants, caterers and more.`,
    areaServed: GREATER_SYDNEY,
    sameAs: [INSTAGRAM_URL],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    name: "Evntly",
    url: SITE_URL,
    inLanguage: "en-AU",
    publisher: { "@id": ORG_ID },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** The vendors listed on a category page, in the order shown. */
export function vendorItemListJsonLd(name: string, vendors: { id: string; name: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: vendors.length,
    itemListElement: vendors.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absoluteUrl(`/vendor/${v.id}`),
      name: v.name,
    })),
  };
}

export type VendorForJsonLd = {
  id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  city: string | null;
  service_type: string;
  rating: number | null;
  review_count: number | null;
};

/**
 * A vendor listing as a LocalBusiness. Only facts from the listing itself:
 * no invented address, hours or phone. Ratings are included only when the
 * vendor has real reviews on Evntly (reviewCount > 0), as Google requires.
 */
export function vendorJsonLd(vendor: VendorForJsonLd, priceRange?: string) {
  const url = absoluteUrl(`/vendor/${vendor.id}`);
  const reviews = vendor.review_count ?? 0;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#business`,
    name: vendor.name,
    description: vendor.bio ?? undefined,
    image: vendor.avatar_url ?? undefined,
    url,
    priceRange: priceRange || undefined,
    knowsAbout: categoryLabel(vendor.service_type),
    address: vendor.city
      ? { "@type": "PostalAddress", addressLocality: vendor.city, addressRegion: "NSW", addressCountry: "AU" }
      : undefined,
    areaServed: GREATER_SYDNEY,
    ...(vendor.rating && vendor.rating > 0 && reviews > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: vendor.rating,
            reviewCount: reviews,
          },
        }
      : {}),
  };
}

/**
 * Explore is a filterable search page. Its plain form is indexable; a
 * category filter on its own points search engines at that category's
 * landing page (/sydney/djs) so the two don't compete; any other filter or
 * search term combination is kept out of the index (follow links only),
 * since each one is a near-duplicate, endlessly varied URL.
 */
export function exploreMetadata(params: { category?: string; q?: string; event?: string; price?: string }): Metadata {
  const { category, q, event, price } = params;
  const live = category && (LAUNCH_CATEGORIES as string[]).includes(category) ? (category as VendorCategory) : null;
  const noindex = { robots: { index: false, follow: true } } satisfies Metadata;

  if (q) {
    return {
      title: `"${q}" — Search results`,
      description: `Vendors matching "${q}" in ${LAUNCH_CITY}.`,
      ...noindex,
    };
  }
  if (live) {
    const heading = categoryHeading(live);
    const base = pageMetadata({
      title: `${heading} in ${LAUNCH_CITY}`,
      description: `Browse ${heading.toLowerCase()} for your event in ${LAUNCH_CITY}.`,
      path: categoryPath(live),
    });
    return event || price ? { ...base, ...noindex } : base;
  }
  const base = pageMetadata({
    title: "Explore vendors",
    description: `Browse every approved event vendor on Evntly in ${LAUNCH_CITY} — no account needed.`,
    path: "/explore",
  });
  return category || event || price ? { ...base, ...noindex } : base;
}

/**
 * Sitemap entries for category pages: only categories with at least one
 * approved listing, dated by their most recently updated listing.
 */
export function categoryPageEntries(vendors: { service_type: string; updated_at: string | null }[]) {
  return categoryPages().flatMap((p) => {
    const inCategory = vendors.filter((v) => v.service_type === p.category);
    if (inCategory.length === 0) return [];
    const latest = inCategory
      .map((v) => v.updated_at)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    return [{ path: p.path, lastModified: latest }];
  });
}
