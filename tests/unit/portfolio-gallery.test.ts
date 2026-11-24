import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { swipeAction, PortfolioGallery } = await import("@/components/portfolio-gallery");

// The photo viewer must always be easy to leave on a phone: the X, Escape,
// tapping outside the photo, or swiping down.
describe("portfolio viewer gestures", () => {
  it("swipe left/right moves between photos", () => {
    expect(swipeAction(-120, 10)).toBe("next");
    expect(swipeAction(120, -10)).toBe("previous");
  });

  it("swipe down closes", () => {
    expect(swipeAction(0, 140)).toBe("close");
    expect(swipeAction(20, 100)).toBe("close");
  });

  it("small or upward drags do nothing", () => {
    expect(swipeAction(20, 30)).toBeNull();
    expect(swipeAction(0, -200)).toBeNull();
    expect(swipeAction(40, 60)).toBeNull();
  });

  it("a diagonal that is mostly sideways is a swipe, not a close", () => {
    expect(swipeAction(-150, 100)).toBe("next");
  });
});

describe("portfolio gallery tiles", () => {
  it("renders a tile per item", () => {
    const items = [0, 1].map((i) => ({ id: `p${i}`, media_type: "image", media_url: `/p${i}.jpg`, thumbnail_url: null, caption: null }));
    const html = renderToStaticMarkup(h(PortfolioGallery, { items: items as never, vendorName: "Test" }));
    expect(html.match(/<button/g)?.length).toBe(2);
  });
});
