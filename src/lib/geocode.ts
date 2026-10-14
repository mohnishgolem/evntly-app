// Suburb-level geocoding via Photon (OpenStreetMap data, free, no key).
// We only ever geocode a vendor's *base suburb*, never a street address, and
// the DB trigger `coarsen_vendor_coordinates` rounds whatever we store to
// ~1 km — so the public map pin shows an area, not a premises.
const PHOTON_URL = "https://photon.komoot.io/api/";
const USER_AGENT = "Evntly/1.0 (https://evntlyapp.com)";

// Australia, roughly. Used both as a search filter and to sanity-check
// coordinates the client sends back from a picked suggestion.
const AU_BBOX = { minLng: 112.9, minLat: -43.7, maxLng: 153.7, maxLat: -10.6 };
// Bias results toward the launch market so "Newtown" means Sydney's first.
const SYDNEY_BIAS = { lat: -33.87, lon: 151.21 };

const STATE_ABBR: Record<string, string> = {
  "New South Wales": "NSW",
  Victoria: "VIC",
  Queensland: "QLD",
  "South Australia": "SA",
  "Western Australia": "WA",
  Tasmania: "TAS",
  "Australian Capital Territory": "ACT",
  "Northern Territory": "NT",
};

// Photon `osm_value`s that are a suburb/town rather than a street or POI.
const PLACE_VALUES = new Set([
  "suburb",
  "city",
  "town",
  "village",
  "hamlet",
  "locality",
  "neighbourhood",
  "quarter",
  "administrative",
  "postcode",
]);

export type Place = {
  label: string;
  latitude: number;
  longitude: number;
};

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    osm_value?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
  };
};

export function isInAustralia(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= AU_BBOX.minLat &&
    lat <= AU_BBOX.maxLat &&
    lng >= AU_BBOX.minLng &&
    lng <= AU_BBOX.maxLng
  );
}

export async function searchPlaces(query: string, limit = 6): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", q);
  // Over-fetch: streets/POIs get filtered out below.
  url.searchParams.set("limit", String(limit * 3));
  url.searchParams.set(
    "bbox",
    `${AU_BBOX.minLng},${AU_BBOX.minLat},${AU_BBOX.maxLng},${AU_BBOX.maxLat}`
  );
  url.searchParams.set("lat", String(SYDNEY_BIAS.lat));
  url.searchParams.set("lon", String(SYDNEY_BIAS.lon));
  url.searchParams.set("lang", "en");

  let features: PhotonFeature[];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      // Suburb geometry doesn't change; let Next cache identical lookups.
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    features = ((await res.json()) as { features?: PhotonFeature[] }).features ?? [];
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const places: Place[] = [];
  for (const f of features) {
    const p = f.properties;
    if (p.countrycode !== "AU" || !p.name || !PLACE_VALUES.has(p.osm_value ?? "")) continue;
    const [longitude, latitude] = f.geometry.coordinates;
    if (!isInAustralia(latitude, longitude)) continue;

    const state = p.state ? (STATE_ABBR[p.state] ?? p.state) : null;
    // Photon's postcode features carry no suburb name, only the number.
    const label =
      p.osm_value === "postcode"
        ? [`Postcode ${p.name}`, state].filter(Boolean).join(", ")
        : [p.name, [state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (seen.has(label)) continue;
    seen.add(label);
    places.push({ label, latitude, longitude });
    if (places.length === limit) break;
  }
  return places;
}

/** Best single match for free-typed text, e.g. a legacy "Surry Hills, NSW". */
export async function geocodeSuburb(text: string): Promise<Place | null> {
  const [first] = await searchPlaces(text, 1);
  return first ?? null;
}
