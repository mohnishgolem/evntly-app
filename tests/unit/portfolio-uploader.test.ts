import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// 17 Nov: on phones the separate "Upload" button after the file picker was
// easy to miss. Choosing files now uploads them; the obvious control is one
// full-width "Add photos or videos" button, and several files can be chosen.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/portfolio", () => ({ addPortfolioItem: vi.fn(), deletePortfolioItem: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const { PortfolioUploader } = await import("@/components/portfolio-uploader");

describe("PortfolioUploader", () => {
  const html = renderToStaticMarkup(h(PortfolioUploader, { providerId: "p1", userId: "u1", items: [] }));

  it("shows one obvious add button and no separate Upload step", () => {
    expect(html).toContain("Add photos or videos");
    expect(html).not.toMatch(/>\s*Upload\s*</);
  });

  it("lets vendors pick several photos or clips at once, of the allowed types", () => {
    expect(html).toMatch(/<input[^>]*type="file"[^>]*multiple/);
    expect(html).toContain("image/jpeg");
    expect(html).toContain("video/quicktime");
  });

  it("announces results to screen readers", () => {
    expect(html).toContain('aria-live="polite"');
  });
});
