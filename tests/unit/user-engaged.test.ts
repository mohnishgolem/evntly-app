import { describe, expect, it, vi } from "vitest";
import { ENGAGEMENT_EVENTS, onFirstEngagement } from "@/lib/user-engaged";

describe("onFirstEngagement (home map waits for the visitor)", () => {
  it("does nothing until the visitor interacts", () => {
    const target = new EventTarget();
    const cb = vi.fn();
    onFirstEngagement(target, cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it("fires once on the first of any engagement event, then stops listening", () => {
    for (const type of ENGAGEMENT_EVENTS) {
      const target = new EventTarget();
      const cb = vi.fn();
      onFirstEngagement(target, cb);
      target.dispatchEvent(new Event(type));
      target.dispatchEvent(new Event("scroll"));
      target.dispatchEvent(new Event("pointerdown"));
      expect(cb).toHaveBeenCalledTimes(1);
    }
  });

  it("can be cancelled before anything happens (component unmounted)", () => {
    const target = new EventTarget();
    const cb = vi.fn();
    const cancel = onFirstEngagement(target, cb);
    cancel();
    target.dispatchEvent(new Event("scroll"));
    expect(cb).not.toHaveBeenCalled();
  });
});
