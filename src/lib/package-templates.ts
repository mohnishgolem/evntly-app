import type { VendorCategory } from "@/lib/config";

// Starter packages for the "Add package" sheet (Nov 2026 onboarding review,
// item 7). A missing package is the most common reason a live listing isn't
// complete, so a vendor can start from a typical package for their category
// and edit it.
//
// Rules: no prices (the vendor always sets their own; we never suggest one),
// nothing a vendor might not offer stated as fact, and every field editable.
// Shown only while a listing has no packages.

export type PackageTemplate = {
  /** Shown on the chip. */
  label: string;
  name: string;
  description: string;
  /** Hours included, or null for a flat-price package. */
  includedHours: number | null;
  inclusions: string[];
};

const TEMPLATES: Record<VendorCategory, PackageTemplate[]> = {
  photographer: [
    {
      label: "Event coverage",
      name: "Event photography",
      description: "Candid and posed photos of your event, edited and delivered online.",
      includedHours: 3,
      inclusions: ["Edited high-resolution photos", "Online gallery to download and share"],
    },
    {
      label: "Wedding day",
      name: "Wedding day coverage",
      description: "From getting ready to the reception, edited and delivered online.",
      includedHours: 8,
      inclusions: ["Edited high-resolution photos", "Online gallery to download and share"],
    },
  ],
  videographer: [
    {
      label: "Highlight film",
      name: "Event highlight film",
      description: "A short edited film of the best moments of your event.",
      includedHours: 4,
      inclusions: ["Edited highlight film", "Online delivery"],
    },
  ],
  dj: [
    {
      label: "Party set",
      name: "Party DJ set",
      description: "DJ set for your party, with music planned around your event.",
      includedHours: 4,
      inclusions: ["DJ and sound system", "Music planned with you beforehand"],
    },
    {
      label: "Wedding",
      name: "Wedding DJ",
      description: "Ceremony, reception and dance floor music for your wedding.",
      includedHours: 5,
      inclusions: ["DJ and sound system", "Microphone for speeches", "Music planned with you beforehand"],
    },
  ],
  mc: [
    {
      label: "Event MC",
      name: "MC for your event",
      description: "Hosting your event and keeping the running sheet on time.",
      includedHours: 4,
      inclusions: ["Running sheet planned with you", "Hosting on the day"],
    },
  ],
  decorator: [
    {
      label: "Party styling",
      name: "Party styling",
      description: "Styling and setup for your event space, packed down afterwards.",
      includedHours: null,
      inclusions: ["Setup before the event", "Pack-down afterwards"],
    },
  ],
  florist: [
    {
      label: "Event flowers",
      name: "Event flowers",
      description: "Fresh flowers for your event, designed around your colours.",
      includedHours: null,
      inclusions: ["Design consultation", "Delivery to your venue"],
    },
  ],
  celebrant: [
    {
      label: "Ceremony",
      name: "Wedding ceremony",
      description: "A personalised ceremony written with you.",
      includedHours: null,
      inclusions: ["Meeting to plan your ceremony", "Ceremony on the day"],
    },
  ],
  caterer: [
    {
      label: "Event catering",
      name: "Event catering",
      description: "Food for your event, with a menu planned around your guests.",
      includedHours: null,
      inclusions: ["Menu planned with you", "Delivery or service on the day"],
    },
  ],
  cakes_desserts: [
    {
      label: "Celebration cake",
      name: "Celebration cake",
      description: "A custom cake for your celebration.",
      includedHours: null,
      inclusions: ["Design chosen with you", "Pick-up or delivery"],
    },
  ],
  makeup_artist: [
    {
      label: "Event makeup",
      name: "Event makeup",
      description: "Makeup for your event, on location or in studio.",
      includedHours: null,
      inclusions: ["Consultation before the day", "Makeup application"],
    },
  ],
  event_planner: [
    {
      label: "On-the-day coordination",
      name: "On-the-day coordination",
      description: "Coordinating your vendors and running sheet on the day.",
      includedHours: 8,
      inclusions: ["Running sheet", "Vendor coordination on the day"],
    },
  ],
  venue: [
    {
      label: "Venue hire",
      name: "Venue hire",
      description: "Exclusive use of the venue for your event.",
      includedHours: 5,
      inclusions: ["Exclusive use of the space", "Setup and pack-down time"],
    },
  ],
};

/** Starter packages for a listing's category (none for an unknown one). */
export function packageTemplatesFor(category: string | null | undefined): PackageTemplate[] {
  if (!category || !Object.hasOwn(TEMPLATES, category)) return [];
  return TEMPLATES[category as VendorCategory];
}
