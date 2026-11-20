import { describe, expect, it } from "vitest";
import { formatEventDate } from "@/components/request-quote";

// Server-rendered in a client component, so it must not depend on ICU data
// (Node and Safari differ, which is a React #418 hydration error).
describe("formatEventDate", () => {
  it("formats a calendar day the same everywhere", () => {
    expect(formatEventDate("2026-11-15")).toBe("Sun 15 Nov 2026");
    expect(formatEventDate("2026-09-05")).toBe("Sat 5 Sep 2026");
    expect(formatEventDate("2027-02-28T00:00:00Z")).toBe("Sun 28 Feb 2027");
  });

  it("doesn't use Intl or the time zone", () => {
    const tz = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    expect(formatEventDate("2026-12-31")).toBe("Thu 31 Dec 2026");
    process.env.TZ = tz;
  });

  it("passes through anything that isn't a date", () => {
    expect(formatEventDate("")).toBe("");
    expect(formatEventDate("soon")).toBe("soon");
  });
});
