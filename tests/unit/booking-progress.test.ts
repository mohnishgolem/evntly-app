import { describe, expect, it } from "vitest";
import { bookingStep } from "@/components/booking-progress";

describe("booking progress", () => {
  it("maps only existing statuses", () => {
    expect(bookingStep("pending")).toBe(0);
    expect(bookingStep("confirmed")).toBe(1);
    expect(bookingStep("completed")).toBe(2);
    expect(bookingStep("cancelled")).toBeNull();
    expect(bookingStep("declined")).toBeNull();
  });
});
