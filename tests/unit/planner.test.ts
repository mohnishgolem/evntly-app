import { describe, expect, it } from "vitest";
import { addDays, buildChecklist, checklistProgress, daysBetween, dueLabel, templatesFor } from "@/lib/planner/checklist";
import { countLabel, recommendVendors } from "@/lib/planner/recommendations";
import { buildTimeline, clockLabel, countdown, dayMarker } from "@/lib/planner/timeline";

const TODAY = "2026-11-24";

describe("checklist", () => {
  it("builds a wedding checklist with one booking task per vendor category", () => {
    const items = buildChecklist({
      eventId: "ev", eventType: "Wedding", eventDate: "2027-10-16", services: ["photographer", "dj"],
      bookings: [], stored: [], today: TODAY,
    });
    const keys = items.map((i) => i.key);
    expect(keys).toContain("confirm_venue");
    expect(keys).toContain("noim");
    expect(keys).toContain("book_photographer");
    expect(keys).toContain("book_dj");
    expect(items.find((i) => i.key === "book_dj")!.title).toBe("Book your DJ");
    expect(items.find((i) => i.key === "book_photographer")!.href).toBe("/dashboard/events/ev?open=photographer#category-photographer");
    // Sorted by due date.
    const dues = items.map((i) => i.dueDate!);
    expect([...dues].sort()).toEqual(dues);
  });

  it("ticks booking tasks from real confirmed bookings, not pending ones", () => {
    const items = buildChecklist({
      eventId: "ev", eventType: "Birthday", eventDate: "2027-01-30", services: ["photographer", "dj", "decorator"],
      bookings: [{ service_type: "photographer", status: "confirmed" }, { service_type: "dj", status: "pending" }],
      stored: [], today: TODAY,
    });
    const photo = items.find((i) => i.key === "book_photographer")!;
    expect(photo).toMatchObject({ done: true, autoDone: true });
    expect(items.find((i) => i.key === "book_dj")).toMatchObject({ done: false, autoDone: false });
    // Done items sink to the bottom.
    expect(items.at(-1)!.key).toBe("book_photographer");
  });

  it("applies the organiser's ticks, edits and dismissals, and keeps their own tasks", () => {
    const items = buildChecklist({
      eventId: "ev", eventType: "Corporate", eventDate: "2027-03-01", services: [], bookings: [], today: TODAY,
      stored: [
        { id: "r1", title: "Book the rooftop", done: true, template_key: "confirm_venue" },
        { id: "r2", title: "x", done: false, template_key: "av_power", dismissed: true },
        { id: "r3", title: "Print name tags", done: false, kind: "task", due_date: "2027-02-25" },
        { id: "r4", title: "Speeches", done: false, kind: "schedule" },
      ],
    });
    expect(items.find((i) => i.key === "confirm_venue")).toMatchObject({ id: "r1", title: "Book the rooftop", done: true });
    expect(items.some((i) => i.key === "av_power")).toBe(false);
    expect(items.find((i) => i.key === "r3")).toMatchObject({ source: "custom", dueDate: "2027-02-25" });
    expect(items.some((i) => i.title === "Speeches")).toBe(false); // schedule items belong to the timeline
    // No vendor categories: no "confirm arrival times".
    expect(items.some((i) => i.key === "arrival_times")).toBe(false);
  });

  it("never shows months-overdue tasks when planning late", () => {
    const items = buildChecklist({
      eventId: "ev", eventType: "Wedding", eventDate: "2026-12-20", services: ["photographer"], bookings: [], stored: [], today: TODAY,
    });
    expect(items.every((i) => i.dueDate! >= TODAY)).toBe(true);
    expect(items.find((i) => i.key === "confirm_venue")!.dueDate).toBe(TODAY);
  });

  it("covers every event type and counts progress", () => {
    for (const t of ["Wedding", "Birthday", "Corporate", "Engagement", "Cultural", "Party", "Something else"]) {
      expect(templatesFor(t, ["dj"]).length).toBeGreaterThan(4);
    }
    expect(checklistProgress([{ done: true }, { done: false }, { done: true }, { done: true }] as never)).toEqual({ done: 3, total: 4, percent: 75 });
    expect(checklistProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("dates and due labels", () => {
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(daysBetween("2026-11-24", "2026-12-24")).toBe(30);
    expect(dueLabel(TODAY, TODAY)).toBe("Due today");
    expect(dueLabel("2026-11-25", TODAY)).toBe("Due tomorrow");
    expect(dueLabel("2026-11-30", TODAY)).toBe("Due in 6 days");
    expect(dueLabel("2027-01-15", TODAY)).toBe("Due 15 Jan");
    expect(dueLabel("2026-11-01", TODAY)).toBe("Overdue");
    expect(dueLabel(null, TODAY)).toBeNull();
  });
});

describe("recommendations", () => {
  const counts = new Map([["photographer", 3], ["videographer", 2], ["dj", 4], ["florist", 0], ["celebrant", 1], ["decorator", 2]]);

  it("suggests what's on the plan but not booked, then relevant extras", () => {
    const { next, ideas } = recommendVendors({
      eventType: "Wedding", requiredServices: ["photographer", "dj"], bookedServices: ["photographer"],
      dismissed: [], approvedCounts: counts, availableOnDate: new Map([["dj", 3]]),
    });
    expect(next.map((r) => r.service)).toEqual(["dj"]);
    expect(next[0]).toMatchObject({ key: "rec:dj", title: "Find your DJ", count: 3, countIsForDate: true, onPlan: true });
    expect(countLabel(next[0])).toBe("3 available on your date");
    // Wedding relevance order, minus booked/planned, minus categories with no real vendors (florist: 0).
    expect(ideas.map((r) => r.service)).toEqual(["celebrant", "videographer", "decorator"]);
    expect(ideas[1]).toMatchObject({ title: "Explore videographers", count: 2, countIsForDate: false });
    expect(countLabel(ideas[1])).toBe("2 on Evntly");
  });

  it("never offers a category without real vendors, and respects dismissals", () => {
    const { next, ideas } = recommendVendors({
      eventType: "Birthday", requiredServices: ["florist"], bookedServices: [], dismissed: ["idea:decorator", "idea:dj"],
      approvedCounts: counts, availableOnDate: new Map(),
    });
    expect(next).toEqual([]); // florist: no approved vendors
    expect(ideas.map((r) => r.service)).not.toContain("decorator");
    expect(ideas.map((r) => r.service)).not.toContain("dj");
    expect(ideas.every((r) => r.count > 0)).toBe(true);
  });

  it("never suggests a hidden category (venue)", () => {
    const { ideas } = recommendVendors({
      eventType: "Wedding", requiredServices: [], bookedServices: [], dismissed: [],
      approvedCounts: new Map([["venue", 5], ["photographer", 1]]), availableOnDate: new Map(),
    });
    expect(ideas.map((r) => r.service)).toEqual(["photographer"]);
  });
});

describe("timeline", () => {
  const base = { eventId: "ev", eventDate: "2027-03-20", startTime: "15:00:00", endTime: "23:00:00", arrivals: new Map<string, string>(), today: TODAY };

  it("groups quotes first, then days in order, with the event day always present", () => {
    const groups = buildTimeline({
      ...base,
      rows: [
        { id: "a", title: "Pay the florist deposit", kind: "reminder", due_date: "2027-01-10", due_time: null, details: null, done: false, dismissed: false, position: 0, created_at: "" },
        { id: "b", title: "First dance", kind: "schedule", due_date: null, due_time: "20:30:00", details: null, done: false, dismissed: false, position: 0, created_at: "" },
        { id: "c", title: "Ideas for the toast", kind: "note", due_date: null, due_time: null, details: null, done: false, dismissed: false, position: 0, created_at: "" },
        { id: "d", title: "Old", kind: "task", due_date: "2027-01-01", due_time: null, details: null, done: false, dismissed: false, position: 0, created_at: "" },
      ],
      bookings: [
        { id: "bk1", provider_name: "Harbourlight", service_type: "photographer", status: "confirmed", event_date: "2027-03-20", start_time: "14:00:00" },
        { id: "bk2", provider_name: "Gone", service_type: "dj", status: "cancelled", event_date: "2027-03-20", start_time: null },
      ],
      quotes: [
        { id: "q1", vendor_name: "Northside Sound", service_type: "dj", status: "pending", quoted_amount: null },
        { id: "q2", vendor_name: "Bloom & Arch", service_type: "decorator", status: "quoted", quoted_amount: 1200 },
        { id: "q3", vendor_name: "Old", service_type: "dj", status: "declined", quoted_amount: null },
      ],
    });
    expect(groups.map((g) => g.key)).toEqual(["now", "2027-01-10", "2027-03-20"]);
    expect(groups[0].items.map((i) => i.title)).toEqual(["Review Bloom & Arch's quote", "Waiting on Northside Sound"]);
    expect(groups[0].items[0]).toMatchObject({ tone: "action", subtitle: "Decorator · $1,200" });
    const day = groups[2];
    expect(day.isEventDay).toBe(true);
    // Chronological: photographer 2pm, event start 3pm, first dance 8:30pm, end 11pm. Cancelled booking and undated note left out.
    expect(day.items.map((i) => i.title)).toEqual(["Harbourlight", "Your event begins", "First dance", "Your event ends"]);
    expect(day.items[0]).toMatchObject({ tone: "confirmed", href: "/bookings/bk1" });
    // Plain tasks are the checklist's, not the timeline's.
    expect(groups.flatMap((g) => g.items).some((i) => i.title === "Old")).toBe(false);
  });

  it("uses the vendor's arrival time when the job card has one", () => {
    const groups = buildTimeline({
      ...base, startTime: null, endTime: null, rows: [], quotes: [],
      arrivals: new Map([["bk1", "12:15:00"]]),
      bookings: [{ id: "bk1", provider_name: "Harbourlight", service_type: "photographer", status: "pending", event_date: "2027-03-20", start_time: "14:00:00" }],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].items[0]).toMatchObject({ time: "12:15", tone: "pending", subtitle: "Photographer · arrives 12:15 pm · Awaiting vendor" });
  });

  it("orders untimed items by their position", () => {
    const row = (id: string, position: number) => ({ id, title: id, kind: "schedule", due_date: null, due_time: null, details: null, done: false, dismissed: false, position, created_at: "" });
    const groups = buildTimeline({ ...base, startTime: null, endTime: null, rows: [row("second", 2), row("first", 1)], bookings: [], quotes: [] });
    expect(groups[0].items.map((i) => i.title)).toEqual(["first", "second"]);
  });

  it("formats clocks, countdowns and day markers", () => {
    expect(clockLabel("00:05")).toBe("12:05 am");
    expect(clockLabel("12:00")).toBe("12:00 pm");
    expect(clockLabel("20:30")).toBe("8:30 pm");
    expect(countdown("2026-11-24", TODAY).label).toBe("Today");
    expect(countdown("2026-11-25", TODAY).label).toBe("Tomorrow");
    expect(countdown("2027-01-03", TODAY)).toEqual({ days: 40, label: "In 40 days" });
    expect(countdown("2026-11-20", TODAY).label).toBe("4 days ago");
    expect(dayMarker("2027-03-20")).toMatchObject({ weekday: "Sat", day: 20, month: "Mar" });
  });
});

describe("recommendations: honest counts", () => {
  it("skips categories already waiting on a quote and falls back to approved counts", () => {
    const { next } = recommendVendors({
      eventType: "Wedding", requiredServices: ["dj", "florist", "celebrant"], bookedServices: [], dismissed: [],
      approvedCounts: new Map([["dj", 4], ["florist", 2], ["celebrant", 1]]),
      availableOnDate: new Map([["florist", 0], ["celebrant", 1]]),
      requestedServices: ["dj"],
    });
    expect(next.map((r) => r.service)).toEqual(["celebrant", "florist"]);
    expect(next[0]).toMatchObject({ count: 1, countIsForDate: true });
    // None matched on the date: the label says "on Evntly", never "available".
    expect(next[1]).toMatchObject({ count: 2, countIsForDate: false });
    expect(countLabel(next[1])).toBe("2 on Evntly");
  });
});
