import { describe, expect, it } from "vitest";
import { isAllowed, normalisePrefs } from "@/lib/notification-prefs";

describe("notification preferences", () => {
  it("defaults everything on (no row = everything, as before)", () => {
    const p = normalisePrefs(null);
    expect(Object.values(p.email).every(Boolean)).toBe(true);
    expect(Object.values(p.push).every(Boolean)).toBe(true);
  });

  it("respects switches per category and channel", () => {
    const p = normalisePrefs({ email: { reminders: false }, push: { messages: false } });
    expect(isAllowed(p, "reminders", "email")).toBe(false);
    expect(isAllowed(p, "reminders", "push")).toBe(true);
    expect(isAllowed(p, "messages", "push")).toBe(false);
    expect(isAllowed(p, "messages", "email")).toBe(true);
  });

  it("never lets booking emails be switched off, but booking push can be", () => {
    const p = normalisePrefs({ email: { bookings: false }, push: { bookings: false } });
    expect(p.email.bookings).toBe(true);
    expect(isAllowed(p, "bookings", "email")).toBe(true);
    expect(isAllowed(p, "bookings", "push")).toBe(false);
  });

  it("treats junk as on and ignores unknown keys", () => {
    const p = normalisePrefs({ email: { enquiries: "no", hacked: false }, push: "x" });
    expect(p.email.enquiries).toBe(true);
    expect("hacked" in p.email).toBe(false);
    expect(p.push.messages).toBe(true);
  });
});
