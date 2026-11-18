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
  photographer: "Wedding, engagement, birthday, corporate and cultural event photographers who know Sydney's venues.",
  decorator: "Balloon garlands, backdrops and table styling for weddings, engagements, birthdays, baby showers and cultural events.",
  dj: "DJs for weddings, birthday parties, engagements, corporate functions and cultural celebrations across Sydney.",
  celebrant: "Find a celebrant for your wedding, vow renewal, commitment ceremony or naming day.",
  venue: "Find a venue for your party, function or celebration.",
  florist: "Flowers for weddings, engagements, birthdays and corporate events, from table arrangements to statement installations.",
  caterer: "Food for parties, corporate functions and family celebrations, from grazing tables to full-service catering.",
  cakes_desserts: "Custom wedding and birthday cakes, dessert tables and sweet treats for every kind of celebration.",
  videographer: "Film your wedding, engagement, milestone birthday, corporate event or cultural celebration.",
  mc: "An MC to host your wedding reception, engagement party, milestone birthday, corporate event or cultural celebration.",
  makeup_artist: "Bridal and event hair and makeup for weddings, engagements, formals, parties and photoshoots.",
  event_planner: "Hand the planning to someone who does it every week: weddings, birthdays, engagements, corporate events and more.",
};

// Search-facing page titles and H1s, phrased the way people search
// ("wedding photographers Sydney", "DJs for hire Sydney"). Short headings
// above stay in navigation, breadcrumbs and pills.
const CATEGORY_TITLES: Record<VendorCategory, string> = {
  photographer: "Wedding & Event Photographers",
  decorator: "Event Decorators & Stylists",
  dj: "DJs for Hire",
  celebrant: "Wedding Celebrants",
  venue: "Event Venues",
  florist: "Wedding & Event Florists",
  caterer: "Event Caterers",
  cakes_desserts: "Cakes & Dessert Tables",
  videographer: "Wedding & Event Videographers",
  mc: "MCs for Hire",
  makeup_artist: "Bridal & Event Makeup Artists",
  event_planner: "Event & Party Planners",
};

// "Before you book" checklists: practical questions to ask, written for
// Evntly. General advice only: no prices, statistics or claims about vendors.
const CATEGORY_TIPS: Record<VendorCategory, string[]> = {
  photographer: [
    "Ask to see a full gallery from one event, not just highlights, so you know how they cover a whole day.",
    "Check how many hours are included, when you'll get your photos and how they're delivered.",
    "Confirm whether travel to your venue, a second shooter or prints cost extra.",
  ],
  decorator: [
    "Share photos of your venue and its rules on hanging items, open flames and set-up times.",
    "Ask what's hired and what you keep, and who packs down at the end of the night.",
    "Confirm delivery, set-up and pack-down times fit your venue booking.",
  ],
  dj: [
    "Share your must-play and do-not-play lists, and ask how they read the room.",
    "Check what's included: speakers, lighting, a microphone for speeches and set-up time.",
    "Confirm your venue's noise limits, power and finish time with the DJ before the day.",
  ],
  celebrant: [
    "Meet first to check you're comfortable with how they'll tell your story.",
    "Ask which paperwork they handle for you and when they need your documents.",
    "Confirm whether a rehearsal, PA system or signing table is included.",
  ],
  venue: [
    "Check capacity, access and parking for your guest numbers.",
    "Ask what's included: furniture, staff, cleaning and AV.",
    "Confirm finish times, noise limits and which suppliers you can bring in.",
  ],
  florist: [
    "Bring photos of your venue and colour palette so they can suggest what's in season.",
    "Ask which pieces can move from the ceremony to the reception.",
    "Confirm delivery, set-up and collection times.",
  ],
  caterer: [
    "Share guest numbers and dietary needs early, including allergies.",
    "Ask whether staff, crockery and cleaning are included or extra.",
    "Check what your venue's kitchen allows and whether the caterer has worked there before.",
  ],
  cakes_desserts: [
    "Order early for busy dates and ask whether tastings are available.",
    "Check delivery, set-up and how the cake should be stored on the day.",
    "Share allergy needs and ask about separate dietary options.",
  ],
  videographer: [
    "Watch a complete film, not only a trailer, to see how they tell the story of a whole event.",
    "Ask what you get: highlight film length, full speeches, raw footage and delivery time.",
    "Check whether drone footage or a second camera operator is included or extra.",
  ],
  mc: [
    "Ask for a short video of them hosting so you can hear their style and timing.",
    "Plan the run sheet together: introductions, speeches, games and key moments.",
    "Check whether they speak the languages your guests do and how they handle name pronunciations.",
  ],
  makeup_artist: [
    "Book a trial so you can see how the look holds up in photos.",
    "Check how many people they can get ready and how early they need to start.",
    "Ask whether they come to you and if travel or early-start fees apply.",
  ],
  event_planner: [
    "Agree on what's included: full planning, on-the-day coordination, or both.",
    "Ask how they work with your other vendors and who your contact is on the day.",
    "Check how they charge: a flat fee, hourly or a percentage of the budget.",
  ],
};

export function categoryHeading(category: VendorCategory) {
  return CATEGORY_HEADINGS[category] ?? categoryLabel(category);
}

/** Meta description: the intro plus a call to action, kept under ~160 chars. */
export function categoryDescription(category: VendorCategory) {
  return `${CATEGORY_INTROS[category]} Request quotes on Evntly.`;
}

export function categoryIntro(category: VendorCategory) {
  return CATEGORY_INTROS[category];
}

/** Search-facing title/H1 for a category page, e.g. "DJs for Hire". */
export function categoryTitle(category: VendorCategory) {
  return CATEGORY_TITLES[category] ?? categoryHeading(category);
}

export function categoryTips(category: VendorCategory) {
  return CATEGORY_TIPS[category] ?? [];
}

/**
 * A meta description from free text (a vendor bio): whitespace collapsed and
 * cut at a word boundary so Google shows it whole (~155 characters).
 */
export function metaDescription(text: string, max = 155) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const atWord = cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : cut.length);
  return `${atWord.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/**
 * Split a listing's free-text city ("Penrith, NSW 2750", "2100", "Ryde") into
 * a suburb and postcode. A postcode on its own becomes "Sydney" so titles
 * never read "DJ in 2100".
 */
export function parseLocality(city: string | null | undefined): { locality: string | null; postcode: string | null } {
  const raw = (city ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return { locality: null, postcode: null };
  const postcode = raw.match(/\b(\d{4})\b/)?.[1] ?? null;
  const locality = raw
    .replace(/\b\d{4}\b/, "")
    .replace(/,?\s*\b(NSW|New South Wales)\b\.?/i, "")
    .replace(/[\s,]+$/, "")
    .trim();
  return { locality: locality || (postcode ? LAUNCH_CITY : null), postcode };
}

/**
 * A vendor's own list of the areas they cover, tidied for display: trimmed,
 * de-duplicated (case-insensitively) and capitalised when typed in lower case.
 */
export function serviceAreas(list: string[] | null | undefined, limit = 40) {
  const seen = new Map<string, string>();
  for (const raw of list ?? []) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const pretty = name === name.toLowerCase() ? name.replace(/\b\w/g, (c) => c.toUpperCase()) : name;
    if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), pretty);
  }
  return [...seen.values()].slice(0, limit);
}

/** Distinct suburbs from real listings, for "areas covered" copy. */
export function listingLocalities(vendors: { city: string | null; is_demo: boolean | null }[], limit = 8) {
  const seen = new Map<string, string>();
  for (const v of vendors) {
    if (v.is_demo) continue;
    const loc = parseLocality(v.city).locality;
    if (loc && !seen.has(loc.toLowerCase())) seen.set(loc.toLowerCase(), loc);
  }
  return [...seen.values()].slice(0, limit);
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
    title: categoryTitle(category),
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
  locations_serviced?: string[] | null;
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
      ? {
          "@type": "PostalAddress",
          addressLocality: parseLocality(vendor.city).locality ?? undefined,
          postalCode: parseLocality(vendor.city).postcode ?? undefined,
          addressRegion: "NSW",
          addressCountry: "AU",
        }
      : undefined,
    // The vendor's own list of areas when they gave one; otherwise Sydney.
    areaServed: serviceAreas(vendor.locations_serviced).length
      ? serviceAreas(vendor.locations_serviced).map((name) => ({ "@type": "Place", name }))
      : GREATER_SYDNEY,
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
      title: `${categoryTitle(live)} in ${LAUNCH_CITY}`,
      description: `Browse ${heading.toLowerCase()} for your event in ${LAUNCH_CITY}.`,
      path: categoryPath(live),
    });
    return event || price ? { ...base, ...noindex } : base;
  }
  const base = pageMetadata({
    title: `Browse Event Vendors in ${LAUNCH_CITY}`,
    description: `Browse every approved event vendor on Evntly in ${LAUNCH_CITY}: photographers, DJs, caterers and more. No account needed.`,
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

/**
 * Listings that count for search: real businesses only. Seeded sample
 * listings (is_demo) may still show on the page while HIDE_SAMPLE_LISTINGS is
 * off, but they mustn't make a page indexable or appear in structured data.
 */
export function realListings<T extends { is_demo: boolean | null }>(vendors: T[]): T[] {
  return vendors.filter((v) => !v.is_demo);
}
