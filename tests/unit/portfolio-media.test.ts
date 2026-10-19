import { describe, expect, it } from "vitest";
import {
  isOwnPortfolioPath,
  portfolioFileError,
  portfolioMediaType,
  portfolioPath,
  portfolioPathFromUrl,
} from "@/lib/portfolio-media";

describe("portfolio media rules", () => {
  it("accepts raster images and short videos only", () => {
    expect(portfolioMediaType("image/jpeg")).toBe("image");
    expect(portfolioMediaType("video/mp4")).toBe("video");
    expect(portfolioMediaType("video/quicktime")).toBe("video");
    expect(portfolioMediaType("image/svg+xml")).toBeNull();
    expect(portfolioMediaType("text/html")).toBeNull();
  });

  it("caps photos at 10 MB and videos at 50 MB", () => {
    const MB = 1024 * 1024;
    expect(portfolioFileError({ type: "image/png", size: 9 * MB })).toBeNull();
    expect(portfolioFileError({ type: "image/png", size: 11 * MB })).toMatch(/10 MB/);
    expect(portfolioFileError({ type: "video/mp4", size: 49 * MB })).toBeNull();
    expect(portfolioFileError({ type: "video/mp4", size: 51 * MB })).toMatch(/50 MB/);
  });

  it("builds paths the server accepts, and only for the caller's own folder", () => {
    const path = portfolioPath("u1", "p1", "video/mp4");
    expect(isOwnPortfolioPath(path, "u1", "p1", "video/mp4")).toBe(true);
    expect(isOwnPortfolioPath(path, "u2", "p1", "video/mp4")).toBe(false);
    expect(isOwnPortfolioPath(path, "u1", "p1", "image/png")).toBe(false);
    expect(isOwnPortfolioPath(`u1/p1/sub/${path.split("/").pop()}`, "u1", "p1", "video/mp4")).toBe(false);
  });

  it("maps a public URL back to its storage path", () => {
    const base = "https://x.supabase.co/storage/v1/object/public/portfolio/";
    expect(portfolioPathFromUrl(`${base}u1/p1/a.jpg`)).toBe("u1/p1/a.jpg");
    expect(portfolioPathFromUrl(`${base}u1/p1/a.jpg?t=1`)).toBe("u1/p1/a.jpg");
    expect(portfolioPathFromUrl(`${base}u1/../u2/a.jpg`)).toBeNull();
    expect(portfolioPathFromUrl("https://images.unsplash.com/photo-1")).toBeNull();
  });
});
