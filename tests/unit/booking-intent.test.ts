import { describe, expect, it } from "vitest";
import { bookIntentPath, bookIntentRedirect } from "@/lib/booking-intent";

describe("booking intent (?book=1 after sign-up)", () => {
  it("redirects a vendor page with ?book=1 to the clean URL, keeping other params", () => {
    const r = bookIntentRedirect(new URL("https://evntlyapp.com/vendor/abc-123?book=1&ref=share"));
    expect(r?.vendorId).toBe("abc-123");
    expect(r?.clean.toString()).toBe("https://evntlyapp.com/vendor/abc-123?ref=share");
  });

  it("leaves everything else alone", () => {
    expect(bookIntentRedirect(new URL("https://evntlyapp.com/vendor/abc-123"))).toBeNull();
    expect(bookIntentRedirect(new URL("https://evntlyapp.com/vendor/abc-123?book=0"))).toBeNull();
    expect(bookIntentRedirect(new URL("https://evntlyapp.com/explore?book=1"))).toBeNull();
    expect(bookIntentRedirect(new URL("https://evntlyapp.com/vendor/abc/reviews?book=1"))).toBeNull();
  });

  it("scopes the cookie to that vendor's page", () => {
    expect(bookIntentPath("abc-123")).toBe("/vendor/abc-123");
  });
});
