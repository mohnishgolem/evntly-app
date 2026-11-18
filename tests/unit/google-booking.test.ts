import { describe, expect, it } from "vitest";
import { googleBookingLink } from "@/lib/google-booking";
import { bookIntentRedirect } from "@/lib/booking-intent";

describe("googleBookingLink (vendor's Google Business Profile Booking link)", () => {
  const link = googleBookingLink("2d48faf3-629d-42a5-86ea-3942aece7ae1");

  it("points at the vendor's listing on the production domain with the booking form requested", () => {
    const url = new URL(link);
    expect(url.origin).toBe("https://evntlyapp.com");
    expect(url.pathname).toBe("/vendor/2d48faf3-629d-42a5-86ea-3942aece7ae1");
    expect(url.searchParams.get("book")).toBe("1");
  });

  it("keeps the Google source tags after the proxy strips ?book=1", () => {
    const intent = bookIntentRedirect(new URL(link));
    expect(intent?.vendorId).toBe("2d48faf3-629d-42a5-86ea-3942aece7ae1");
    expect(intent?.clean.searchParams.has("book")).toBe(false);
    expect(intent?.clean.searchParams.get("utm_source")).toBe("google");
    expect(intent?.clean.searchParams.get("utm_medium")).toBe("gbp_booking");
  });

  it("escapes odd ids instead of breaking the path", () => {
    expect(new URL(googleBookingLink("a/b")).pathname).toBe("/vendor/a%2Fb");
  });
});
