import { isLaunchCategory } from "@/lib/config";
import { categoryNoun } from "@/lib/planner/checklist";

// Which vendors to suggest next, from the event's type, the categories the
// organiser picked and what's already booked. Counts come from real approved
// listings (sample listings excluded); a category with none is never offered.

/** Categories that usually matter for each event type, most important first. */
const RELEVANCE: Record<string, string[]> = {
  Wedding: ["photographer", "celebrant", "videographer", "florist", "decorator", "makeup_artist", "dj", "mc", "cakes_desserts", "caterer", "event_planner"],
  Engagement: ["photographer", "decorator", "florist", "dj", "cakes_desserts", "caterer", "makeup_artist", "videographer", "mc"],
  Birthday: ["decorator", "cakes_desserts", "dj", "photographer", "caterer", "mc", "florist", "makeup_artist"],
  Corporate: ["caterer", "photographer", "videographer", "mc", "decorator", "dj", "event_planner", "florist"],
  Cultural: ["decorator", "caterer", "photographer", "videographer", "dj", "mc", "makeup_artist", "florist", "cakes_desserts"],
  Party: ["dj", "decorator", "caterer", "cakes_desserts", "photographer", "mc", "florist"],
};

/** One line on why a category helps, written for the planner (not an ad). */
const WHY: Record<string, string> = {
  photographer: "Photos you'll keep long after the day.",
  videographer: "The speeches, the music and the moments, in motion.",
  dj: "Music that reads the room and keeps the floor full.",
  mc: "Keeps the schedule on time and the room engaged.",
  decorator: "Styling, backdrops and table settings for your theme.",
  florist: "Bouquets, arrangements and installations.",
  makeup_artist: "Hair and makeup that lasts all day.",
  cakes_desserts: "A centrepiece cake or a dessert table.",
  caterer: "Food sized to your guest list and dietary needs.",
  celebrant: "Your ceremony, written with you, and the legal paperwork.",
  event_planner: "Someone to coordinate vendors and the day itself.",
};

export type Recommendation = {
  service: string;
  /** "rec:dj" (timeline card) or "idea:dj" (More ideas): what dismissal stores. */
  key: string;
  title: string;
  why: string;
  /** Vendors to choose from: on the organiser's date when known, else approved in the category. */
  count: number;
  countIsForDate: boolean;
  /** In the organiser's vendor list already (their board can show matches). */
  onPlan: boolean;
};

export function relevantCategories(eventType: string) {
  return (RELEVANCE[eventType] ?? RELEVANCE.Party).filter(isLaunchCategory);
}

export function categoryPluralNoun(service: string) {
  const noun = categoryNoun(service);
  if (service === "cakes_desserts") return "cake and dessert makers";
  return noun.endsWith("s") ? noun : `${noun}s`;
}

export function recommendVendors(input: {
  eventType: string;
  requiredServices: string[];
  bookedServices: string[];
  dismissed: string[];
  /** approved, non-sample listings per category */
  approvedCounts: Map<string, number>;
  /** available on the event date (board matching), for categories on the plan */
  availableOnDate: Map<string, number>;
  /** categories with a quote request still open: the next move is the vendor's or a review */
  requestedServices?: string[];
}) {
  const { eventType, requiredServices, bookedServices, dismissed, approvedCounts, availableOnDate } = input;
  const requested = new Set(input.requestedServices ?? []);
  const booked = new Set(bookedServices);
  const gone = new Set(dismissed);
  const relevant = relevantCategories(eventType);
  const rank = (s: string) => {
    const i = (relevant as string[]).indexOf(s);
    return i === -1 ? 99 : i;
  };

  const make = (service: string, kind: "rec" | "idea"): Recommendation | null => {
    const onPlan = requiredServices.includes(service);
    // Free on the date when matching knows; otherwise every approved listing
    // in the category (labelled as such, never as "available").
    const onDate = onPlan ? availableOnDate.get(service) ?? 0 : 0;
    const dated = onDate > 0;
    const count = dated ? onDate : approvedCounts.get(service) ?? 0;
    if (count === 0) return null;
    return {
      service,
      key: `${kind}:${service}`,
      title: kind === "rec" ? `Find your ${categoryNoun(service)}` : `Explore ${categoryPluralNoun(service)}`,
      why: WHY[service] ?? "",
      count,
      countIsForDate: dated,
      onPlan,
    };
  };

  // Next to book: on the plan, not booked yet — shown in the timeline.
  const next = requiredServices
    .filter((s) => !booked.has(s) && !requested.has(s) && isLaunchCategory(s))
    .sort((a, b) => rank(a) - rank(b))
    .map((s) => make(s, "rec"))
    .filter((r): r is Recommendation => !!r && !gone.has(r.key));

  // More ideas: relevant to this kind of event but not on the plan yet.
  const ideas = relevant
    .filter((s) => !requiredServices.includes(s) && !booked.has(s))
    .map((s) => make(s, "idea"))
    .filter((r): r is Recommendation => !!r && !gone.has(r.key));

  return { next, ideas };
}

/** "6 available on your date" / "12 in Sydney" / "1 in Sydney". */
export function countLabel(r: Pick<Recommendation, "count" | "countIsForDate">) {
  return r.countIsForDate ? `${r.count} available on your date` : `${r.count} on Evntly`;
}
