import { z } from "zod";
import { EVENT_TYPES, LAUNCH_CATEGORIES, type VendorCategory } from "@/lib/config";
import { pricingComplete, type PricingDraft } from "@/lib/pricing-model";

// The private listing a vendor (or our team, with the owner's permission)
// builds before an Evntly account exists. Shared by the browser builder, the
// server actions that save it and the admin "prepare a draft" form.
//
// Nothing here is public. A draft becomes a service_providers row only when
// the owner is signed in with a verified email, gives their ABN and accepts
// the Vendor Service Agreement (saveDraftAsListing); it goes live only after
// they submit it for review and an admin approves it. Same gates as before.

export type DraftPackage = {
  name: string;
  description: string;
  /** Dollars. Always set by the vendor; suggestions never contain a price. */
  price: number | null;
  includedHours: number | null;
  inclusions: string[];
  /** The vendor ticked "Add to my listing" on this package. */
  approved: boolean;
};

export type ListingDraft = PricingDraft & {
  serviceType: string;
  businessName: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  eventTypes: string[];
  bio: string;
  /** Where the description came from, for funnel tracking only. */
  bioSource?: "vendor" | "assisted" | "suggested";
  instagram: string;
  website: string;
  packages: DraftPackage[];
};

export const EMPTY_DRAFT: ListingDraft = {
  serviceType: "",
  businessName: "",
  city: "",
  eventTypes: [],
  pricingModel: "from",
  hourlyRate: null,
  basePrice: null,
  bio: "",
  instagram: "",
  website: "",
  packages: [],
};

export const MAX_PACKAGES = 4;
export const BIO_MAX = 1200;

// Too long is trimmed, not thrown away: a pasted bio must never vanish.
const text = (max: number) =>
  z
    .string()
    .catch("")
    .transform((v) => v.trim().slice(0, max));
const money = z.number().min(0).max(1_000_000).nullable().catch(null);

const packageSchema = z.object({
  name: z.string().transform((v) => v.trim().slice(0, 80)).pipe(z.string().min(1)),
  description: text(600),
  price: money,
  includedHours: z.number().min(0.5).max(72).nullable().catch(null),
  inclusions: z
    .array(z.string())
    .catch([])
    .transform((v) => v.map((i) => i.trim().slice(0, 120)).filter(Boolean).slice(0, 10)),
  approved: z.boolean().catch(false),
});

/**
 * Untrusted input (browser, stored JSON) → a clean draft. Unknown fields are
 * dropped and bad values fall back to empty, so an old or tampered draft
 * still opens instead of failing the whole save.
 */
export const listingDraftSchema = z.object({
  serviceType: z.string().catch("").transform((v) => (LAUNCH_CATEGORIES.includes(v as VendorCategory) ? v : "")),
  businessName: text(120),
  city: text(120),
  latitude: z.number().min(-90).max(90).nullable().optional().catch(null),
  longitude: z.number().min(-180).max(180).nullable().optional().catch(null),
  eventTypes: z
    .array(z.string())
    .catch([])
    .transform((v) => [...new Set(v.filter((t) => (EVENT_TYPES as readonly string[]).includes(t)))]),
  pricingModel: z.enum(["hourly", "fixed", "from", "quote"]).catch("from"),
  hourlyRate: money.optional(),
  basePrice: money.optional(),
  bio: text(BIO_MAX),
  bioSource: z.enum(["vendor", "assisted", "suggested"]).optional().catch(undefined),
  instagram: text(120),
  website: text(200),
  packages: z
    .array(z.unknown())
    .catch([])
    .transform((list) =>
      list
        .map((p) => packageSchema.safeParse(p))
        .filter((r) => r.success)
        .map((r) => r.data as DraftPackage)
        .slice(0, MAX_PACKAGES)
    ),
});

export function parseDraft(value: unknown): ListingDraft {
  const parsed = listingDraftSchema.safeParse(value ?? {});
  return parsed.success ? { ...EMPTY_DRAFT, ...(parsed.data as ListingDraft) } : { ...EMPTY_DRAFT };
}

// ── Steps ────────────────────────────────────────────────────────────────
// One question per screen. "required" steps must be answered to continue;
// the rest can be skipped and finished later.

export const BUILDER_STEPS = [
  { id: "category", title: "What kind of event business do you run?", required: true },
  { id: "name", title: "What's your business called?", required: true },
  { id: "location", title: "Where are you based?", required: true },
  { id: "events", title: "Which events do you work?", required: true },
  { id: "pricing", title: "How do you usually price?", required: true },
  { id: "about", title: "Tell customers about your business", required: false },
  { id: "packages", title: "Add a package customers can book", required: false },
  { id: "review", title: "Your listing preview", required: false },
] as const;
export type BuilderStepId = (typeof BUILDER_STEPS)[number]["id"];

export function stepComplete(step: BuilderStepId, d: ListingDraft): boolean {
  switch (step) {
    case "category":
      return !!d.serviceType;
    case "name":
      return d.businessName.trim().length >= 2;
    case "location":
      return d.city.trim().length >= 2;
    case "events":
      return d.eventTypes.length > 0;
    case "pricing":
      return pricingComplete(d);
    case "about":
      return d.bio.trim().length >= 40;
    case "packages":
      return approvedPackages(d).length > 0;
    case "review":
      return true;
  }
}

/** Packages the vendor approved and priced: the only ones that get saved. */
export function approvedPackages(d: ListingDraft): DraftPackage[] {
  return d.packages.filter((p) => p.approved && p.price != null && p.price >= 1);
}

/** The first step still needing an answer (where a returning vendor lands). */
export function firstOpenStep(d: ListingDraft): number {
  const i = BUILDER_STEPS.findIndex((s) => s.required && !stepComplete(s.id, d));
  return i === -1 ? BUILDER_STEPS.length - 1 : i;
}

/** Enough to create a listing (everything the old 5-step form required, bar ABN and agreement). */
export function readyToSave(d: ListingDraft): boolean {
  return BUILDER_STEPS.filter((s) => s.required).every((s) => stepComplete(s.id, d));
}

/** 0–100, for the progress bar. Optional steps count once answered. */
export function draftProgress(d: ListingDraft): number {
  const done = BUILDER_STEPS.filter((s) => s.id !== "review" && stepComplete(s.id, d)).length;
  return Math.round((done / (BUILDER_STEPS.length - 1)) * 100);
}

/** Only the first time a draft has something worth keeping on the server. */
export function worthSaving(d: ListingDraft): boolean {
  return !!d.serviceType && d.businessName.trim().length >= 2;
}

// ── Links the vendor gives us ────────────────────────────────────────────

/** "@name", "instagram.com/name/" → "name". Null when it isn't a handle. */
export function instagramHandle(value: string): string | null {
  const v = value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v : null;
}

/** A plain http(s) website, or null. */
export function websiteUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
