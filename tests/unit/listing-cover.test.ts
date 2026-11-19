import { describe, expect, it } from "vitest";
import { listingCoverUrl, resizedImageUrl } from "@/lib/portfolio-media";

const obj = "https://pzeosxtdulveuywhmkfe.supabase.co/storage/v1/object/public/portfolio/u/p/a.jpg";

describe("listing card cover", () => {
  it("resizes Supabase public images and leaves others alone", () => {
    expect(resizedImageUrl(obj, 600)).toBe(
      "https://pzeosxtdulveuywhmkfe.supabase.co/storage/v1/render/image/public/portfolio/u/p/a.jpg?width=600&height=600&resize=cover&quality=70",
    );
    expect(resizedImageUrl("https://images.unsplash.com/photo-1", 600)).toBe("https://images.unsplash.com/photo-1");
    expect(resizedImageUrl(`${obj}?v=1`, 600)).toBe(`${obj}?v=1`);
  });

  it("prefers the first portfolio photo, then the profile photo, then nothing", () => {
    expect(listingCoverUrl({ portfolio_urls: [obj], avatar_url: "https://cdn/logo.png" }, 160)).toContain("/render/image/public/portfolio/u/p/a.jpg?width=160");
    expect(listingCoverUrl({ portfolio_urls: [], avatar_url: "https://cdn/logo.png" }, 160)).toBe("https://cdn/logo.png");
    expect(listingCoverUrl({ portfolio_urls: null, avatar_url: null }, 160)).toBeNull();
  });
});
