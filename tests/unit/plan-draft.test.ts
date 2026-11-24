import { describe, expect, it } from "vitest";
import { defaultEventName, missingForPlan, planDraftSchema, readDraft } from "@/lib/planner/draft";
import { isPlanReturn } from "@/lib/safe-redirect";
import { eventTitle } from "@/components/event-board/board-cards";

describe("plan draft", () => {
  it("needs only a type and a date", () => {
    const parsed = planDraftSchema.safeParse({ eventType: "Wedding", eventDate: "2027-06-12" });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ name: "", suburb: "", guestCount: "", budgetTotal: 0, requiredServices: [], notes: "" });
  });

  it("explains what's missing instead of failing silently", () => {
    expect(missingForPlan({ eventType: "", eventDate: "" })).toEqual(["what you're planning", "a date"]);
    expect(missingForPlan({ eventType: "Party", eventDate: "" })).toEqual(["a date"]);
    expect(missingForPlan({ eventType: "Party", eventDate: "2027-01-01" })).toEqual([]);
    const noType = planDraftSchema.safeParse({ eventType: "", eventDate: "2027-01-01" });
    expect(noType.error?.issues[0].message).toBe("Choose what you're planning.");
  });

  it("still validates what is given", () => {
    expect(planDraftSchema.safeParse({ eventType: "Party", eventDate: "2027-01-01", guestCount: "loads" }).success).toBe(false);
    expect(planDraftSchema.safeParse({ eventType: "Party", eventDate: "2027-01-01", startTime: "18:00" }).success).toBe(false); // both or neither
    expect(planDraftSchema.safeParse({ eventType: "Party", eventDate: "2027-01-01", name: "x".repeat(81) }).success).toBe(false);
  });

  it("reads drafts saved by the old and new forms, and rejects junk", () => {
    const old = JSON.stringify({ draft: { eventType: "Birthday", eventDate: "2027-01-01", suburb: "Bondi", guestCount: "Under 80", budgetTotal: 5000, requiredServices: ["dj"] }, postToFeed: true });
    expect(readDraft(old)).toMatchObject({ postToFeed: true, draft: { eventType: "Birthday", requiredServices: ["dj"] } });
    expect(readDraft(JSON.stringify({ eventType: "Party", eventDate: "2027-01-01" }))?.draft.eventType).toBe("Party");
    expect(readDraft("{not json")).toBeNull();
    expect(readDraft(null)).toBeNull();
    expect(readDraft(JSON.stringify({ hello: 1 }))).toBeNull();
  });

  it("gives every event a sensible name", () => {
    expect(defaultEventName("Wedding")).toBe("Our wedding");
    expect(defaultEventName("Something new")).toBe("Our event");
    expect(eventTitle({ name: null, event_type: "Birthday", suburb: "" })).toBe("Birthday celebration");
    expect(eventTitle({ name: null, event_type: "Birthday", suburb: "Bondi" })).toBe("Birthday in Bondi");
    expect(eventTitle({ name: "Mia's 30th", event_type: "Birthday", suburb: "" })).toBe("Mia's 30th");
  });

  it("recognises the save-your-plan return, and only that", () => {
    expect(isPlanReturn("/dashboard?from=plan")).toBe(true);
    expect(isPlanReturn("/dashboard?x=1&from=plan")).toBe(true);
    expect(isPlanReturn("/dashboard")).toBe(false);
    expect(isPlanReturn("//evil.com/dashboard?from=plan")).toBe(false);
    expect(isPlanReturn(null)).toBe(false);
  });
});
