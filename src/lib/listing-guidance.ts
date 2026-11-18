// Help for the two steps vendors stall on when finishing a listing: which
// photos to add, and a first package drafted from what they already told us
// in the sign-up form. Nothing here is saved on its own: the vendor checks
// the drafted package and taps Save, so every price on a listing is theirs.

import { pricingModelOf, TYPICAL_BOOKING_HOURS, type PricedListing } from "@/lib/pricing-model";

type CategoryGuide = {
  /** Used as "4-hour {hourlyName}". */
  hourlyName: string;
  /** Used for fixed, "from" and quote pricing. */
  packageName: string;
  /** Placeholder for the "What's included" box (one per line). */
  inclusionExample: string;
  /** What to show in each of the 3 required photos. */
  photoTips: [string, string, string];
};

const GENERIC: CategoryGuide = {
  hourlyName: "booking",
  packageName: "Standard package",
  inclusionExample: "What the customer gets\nHow long you're there\nAnything extra that's included",
  photoTips: ["Your best work", "You in action at an event", "A close-up or setup shot"],
};

const GUIDES: Record<string, CategoryGuide> = {
  photographer: {
    hourlyName: "event photography",
    packageName: "Event photography",
    inclusionExample: "Edited photos in an online gallery\nArrive 30 minutes early\nPrint-ready files",
    photoTips: ["Your favourite shot", "Candid guests at an event", "Portrait or detail shot"],
  },
  videographer: {
    hourlyName: "event videography",
    packageName: "Event highlights video",
    inclusionExample: "3–5 minute highlights film\nOnline delivery\nLicensed music",
    photoTips: ["A frame from your best film", "You filming at an event", "Your gear or a behind-the-scenes shot"],
  },
  dj: {
    hourlyName: "DJ set",
    packageName: "Party DJ package",
    inclusionExample: "Sound system and lighting\nMicrophone for speeches\nMusic requests taken in advance",
    photoTips: ["You behind the decks", "A packed dance floor", "Your setup and lighting"],
  },
  mc: {
    hourlyName: "MC hosting",
    packageName: "Event MC package",
    inclusionExample: "Run sheet planning call\nHosting speeches and formalities\nWireless microphone",
    photoTips: ["You on the mic", "The crowd at an event you hosted", "You with the couple or host"],
  },
  celebrant: {
    hourlyName: "ceremony",
    packageName: "Ceremony package",
    inclusionExample: "Planning meeting\nPersonalised ceremony script\nLodging the paperwork",
    photoTips: ["You leading a ceremony", "A ceremony setting", "You with a couple"],
  },
  decorator: {
    hourlyName: "styling",
    packageName: "Event styling package",
    inclusionExample: "Backdrop and balloon garland\nTable styling\nSet-up and pack-down",
    photoTips: ["Your best full setup", "A table or backdrop close-up", "The room before guests arrive"],
  },
  florist: {
    hourlyName: "floral styling",
    packageName: "Event flowers package",
    inclusionExample: "Bouquet\nTable arrangements\nDelivery and set-up",
    photoTips: ["Your best arrangement", "Flowers styled at a venue", "A bouquet close-up"],
  },
  caterer: {
    hourlyName: "catering",
    packageName: "Catering package",
    inclusionExample: "Menu for up to 50 guests\nServing staff\nSet-up and clean-up",
    photoTips: ["Your signature dish", "A buffet or grazing table", "Your team serving at an event"],
  },
  cakes_desserts: {
    hourlyName: "dessert service",
    packageName: "Celebration cake",
    inclusionExample: "Two-tier cake (serves 40)\nFlavour of your choice\nDelivery in Sydney",
    photoTips: ["Your showstopper cake", "A dessert table", "A close-up of the detail"],
  },
  makeup_artist: {
    hourlyName: "makeup",
    packageName: "Event makeup package",
    inclusionExample: "Makeup for one person\nLashes included\nTouch-up kit",
    photoTips: ["Your best finished look", "Before and after", "You working on a client"],
  },
  event_planner: {
    hourlyName: "event coordination",
    packageName: "Event planning package",
    inclusionExample: "Planning sessions\nSupplier bookings\nOn-the-day coordination",
    photoTips: ["An event you planned", "A styled detail from that event", "You running the day"],
  },
  venue: {
    hourlyName: "venue hire",
    packageName: "Venue hire package",
    inclusionExample: "Exclusive use of the space\nTables and chairs\nIn-house sound system",
    photoTips: ["The space set up for an event", "The space from the entrance", "A detail guests will love"],
  },
};

export function categoryGuide(category: string | null | undefined): CategoryGuide {
  return (category && GUIDES[category]) || GENERIC;
}

export function photoTips(category: string | null | undefined): [string, string, string] {
  return categoryGuide(category).photoTips;
}

/** The first package, drafted from the listing's pricing (money in dollars). */
export type StarterPackage = {
  name: string;
  price: number | null;
  includedHours: number | null;
  extraHourPrice: number | null;
  inclusionExample: string;
};

function positive(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Hourly vendors get a typical-length booking at their rate, with extra hours
 * at the same rate. Fixed and "from" prices become one flat package. Quote-only
 * vendors (or a missing amount) get the name and leave the price to fill in.
 */
export function starterPackage(listing: PricedListing & { service_type?: string | null }): StarterPackage {
  const guide = categoryGuide(listing.service_type);
  const model = pricingModelOf(listing);
  if (model === "hourly") {
    const rate = positive(listing.hourly_rate);
    if (rate != null) {
      return {
        name: `${TYPICAL_BOOKING_HOURS}-hour ${guide.hourlyName}`,
        price: Math.round(rate * TYPICAL_BOOKING_HOURS * 100) / 100,
        includedHours: TYPICAL_BOOKING_HOURS,
        extraHourPrice: rate,
        inclusionExample: guide.inclusionExample,
      };
    }
  }
  const base = model === "fixed" || model === "from" ? positive(listing.base_price) : null;
  return { name: guide.packageName, price: base, includedHours: null, extraHourPrice: null, inclusionExample: guide.inclusionExample };
}
