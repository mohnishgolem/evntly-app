import { describe, expect, it } from "vitest";
import {
  clampCrop,
  coverRect,
  DEFAULT_CROP,
  isDisplayablePortfolioImage,
  isShareSource,
  panCrop,
  SHARE_FORMATS,
  shareFileName,
  shareImageUrl,
  shareProfileUrl,
  shareEventLabels,
  sharePhotoOptions,
  shareSourceFromUrl,
  STORY_STICKER_ZONE,
} from "@/lib/share-profile";
import { pageViewFor, parseSourceParams, sourceParamsFrom } from "@/lib/page-views";
import { sourceFromParams } from "@/lib/founding/sources";

const ID = "d5984a9a-70dc-4e42-a1ce-dcdd2022d1d7";

describe("share links", () => {
  it("tags the public listing with a distinct source per channel", () => {
    expect(shareProfileUrl(ID, "share_story")).toBe(`https://evntlyapp.com/vendor/${ID}?src=share_story`);
    expect(shareProfileUrl(ID, "share_link")).toBe(`https://evntlyapp.com/vendor/${ID}?src=share_link`);
    expect(shareProfileUrl(ID, "share_qr")).toBe(`https://evntlyapp.com/vendor/${ID}?src=share_qr`);
  });

  it("only recognises share sources on vendor pages", () => {
    expect(shareSourceFromUrl(new URL(`https://evntlyapp.com/vendor/${ID}?src=share_qr`))).toEqual({ vendorId: ID, source: "share_qr" });
    expect(shareSourceFromUrl(new URL(`https://evntlyapp.com/vendor/${ID}?src=instagram_bio`))).toBeNull();
    expect(shareSourceFromUrl(new URL(`https://evntlyapp.com/vendor/${ID}/x?src=share_qr`))).toBeNull();
    expect(shareSourceFromUrl(new URL(`https://evntlyapp.com/founding-vendors?src=share_qr`))).toBeNull();
    expect(isShareSource("share_link")).toBe(true);
    expect(isShareSource("share_")).toBe(false);
  });

  it("travels through the page-view beacon and doesn't count as a founding source", () => {
    const params = sourceParamsFrom("?src=share_qr");
    expect(params).toEqual({ src: "share_qr" });
    expect(parseSourceParams(params)).toEqual({ src: "share_qr" });
    expect(pageViewFor(`/vendor/${ID}`)).toEqual({ kind: "vendor", vendorId: ID });
    // A share visit must never be mistaken for a founding-vendor channel.
    expect(sourceFromParams({ src: "share_qr" })).toBeNull();
  });
});

describe("artwork details", () => {
  it("lists the events a vendor covers, in their order", () => {
    expect(shareEventLabels(["Wedding", "Birthday", "Corporate", "Engagement"])).toEqual(["Weddings", "Birthdays", "Corporate events"]);
    expect(shareEventLabels(["Corporate", "Party"])).toEqual(["Corporate events", "Parties"]);
    expect(shareEventLabels(["Cultural", " Cultural", "Gala"])).toEqual(["Cultural events", "Gala"]);
    expect(shareEventLabels(null)).toEqual([]);
  });

  it("picks the first displayable portfolio photo, then the profile photo", () => {
    const items = [
      { media_type: "video", media_url: "https://x/a.mp4" },
      { media_type: "image", media_url: "https://x/b.HEIC" },
      { media_type: "image", media_url: "https://x/c.jpg" },
      { media_type: "image", media_url: "https://x/d.png" },
    ];
    expect(sharePhotoOptions(items, "https://x/avatar.jpg").map((p) => p.url)).toEqual(["https://x/c.jpg", "https://x/d.png", "https://x/avatar.jpg"]);
    expect(sharePhotoOptions([], "https://x/avatar.jpg")).toEqual([{ url: "https://x/avatar.jpg", kind: "avatar" }]);
    expect(sharePhotoOptions(items.slice(0, 2), null)).toEqual([]); // → branded fallback
    expect(isDisplayablePortfolioImage({ media_type: "image", media_url: "https://x/y.heic?v=1" })).toBe(false);
  });

  it("loads resized copies of storage photos only", () => {
    const u = "https://p.supabase.co/storage/v1/object/public/portfolio/a/b/c.jpg";
    expect(shareImageUrl(u, 2000)).toBe("https://p.supabase.co/storage/v1/render/image/public/portfolio/a/b/c.jpg?width=2000&quality=85");
    expect(shareImageUrl("https://elsewhere.com/x.jpg", 2000)).toBe("https://elsewhere.com/x.jpg");
  });

  it("names the files", () => {
    expect(shareFileName("DJ Valgen", "story")).toBe("dj-valgen-evntly-story.jpg");
    expect(shareFileName("Café & Co!", "card")).toBe("cafe-co-evntly-profile-card.jpg");
  });
});

describe("formats and crop", () => {
  it("exports at the exact sizes", () => {
    expect([SHARE_FORMATS.story.width, SHARE_FORMATS.story.height]).toEqual([1080, 1920]);
    expect([SHARE_FORMATS.card.width, SHARE_FORMATS.card.height]).toEqual([1080, 1350]);
    // The sticker space sits between Instagram's top bar and the details block (from y≈1400).
    expect(STORY_STICKER_ZONE.y).toBeGreaterThan(900);
    expect(STORY_STICKER_ZONE.y + STORY_STICKER_ZONE.h).toBeLessThanOrEqual(1400);
  });

  it("covers the frame at any crop", () => {
    for (const crop of [DEFAULT_CROP, { zoom: 2.5, fx: 0, fy: 1 }, { zoom: 1.3, fx: 0.8, fy: 0.2 }]) {
      const r = coverRect(4000, 3000, 1080, 1920, crop);
      expect(r.x).toBeLessThanOrEqual(0);
      expect(r.y).toBeLessThanOrEqual(0);
      expect(r.x + r.w).toBeGreaterThanOrEqual(1080 - 1e-6);
      expect(r.y + r.h).toBeGreaterThanOrEqual(1920 - 1e-6);
    }
    expect(coverRect(1000, 1000, 1080, 920, DEFAULT_CROP)).toEqual({ x: 0, y: -80, w: 1080, h: 1080 });
  });

  it("pans with the drag and stops at the photo's edges", () => {
    // Landscape photo in the tall Story frame: only horizontal room to pan.
    const moved = panCrop(DEFAULT_CROP, -200, 50, 4000, 3000, 1080, 1920);
    expect(moved.fx).toBeGreaterThan(0.5);
    expect(moved.fy).toBe(0.5);
    expect(panCrop(DEFAULT_CROP, -100000, 0, 4000, 3000, 1080, 1920).fx).toBe(1);
    expect(clampCrop({ zoom: 9, fx: -1, fy: 2 })).toEqual({ zoom: 3, fx: 0, fy: 1 });
    expect(clampCrop({ zoom: Number.NaN, fx: 0.5, fy: 0.5 }).zoom).toBe(1);
  });
});
