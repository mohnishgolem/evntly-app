import { describe, expect, it } from "vitest";
import { earliestEventDate, isBookableEventDate, sydneyDate } from "@/lib/event-dates";

describe("event dates (Sydney calendar days)", () => {
  // 18 Oct 2026, 10:25 UTC = 9:25pm in Sydney (AEDT, UTC+11).
  const now = new Date("2026-10-18T10:25:00Z");

  it("uses the Sydney date, not UTC", () => {
    expect(sydneyDate(0, now)).toBe("2026-10-18");
    // 14:00 UTC is already the next day in Sydney.
    expect(sydneyDate(0, new Date("2026-10-18T14:00:00Z"))).toBe("2026-10-19");
  });

  it("only allows events from tomorrow onwards", () => {
    expect(earliestEventDate(now)).toBe("2026-10-19");
    expect(isBookableEventDate("2026-10-18", now)).toBe(false); // the bug: same-day event
    expect(isBookableEventDate("2026-10-01", now)).toBe(false);
    expect(isBookableEventDate("2026-10-19", now)).toBe(true);
    expect(isBookableEventDate("2027-03-14", now)).toBe(true);
    expect(isBookableEventDate("19/10/2026", now)).toBe(false);
  });
});
