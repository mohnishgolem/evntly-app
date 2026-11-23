import { describe, expect, it } from "vitest";
import { formatCalendarDay, formatSydneyLongDate, groupDigits } from "@/lib/founding/schedule";

// Client components render on the server first, so their text must not depend
// on the visitor's locale or ICU build (React #418 on iPhone, 15 Nov).
describe("hydration-safe formatting", () => {
  it("groups digits the same in every locale", () => {
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(999)).toBe("999");
    expect(groupDigits(1000)).toBe("1,000");
    expect(groupDigits(100000)).toBe("100,000");
    expect(groupDigits(1234567.5)).toBe("1,234,567.5");
    expect(groupDigits(-25000)).toBe("-25,000");
  });

  it("formats a date-only value without shifting the day", () => {
    expect(formatCalendarDay("2026-11-03")).toBe("Tue 3 Nov");
    expect(formatCalendarDay("2026-12-25T00:00:00Z")).toBe("Fri 25 Dec");
    expect(formatCalendarDay("soon")).toBe("soon");
  });

  it("formats a long date in Sydney time", () => {
    expect(formatSydneyLongDate("2026-11-02T23:10:00Z")).toBe("3 November 2026");
    expect(formatSydneyLongDate(null)).toBe("");
    expect(formatSydneyLongDate("nope")).toBe("");
  });
});
