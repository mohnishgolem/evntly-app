import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// After claiming a founding place, a vendor with no listing must see one clear
// next step ("Create my listing"), not just a list row and a Withdraw button.
vi.mock("@/components/founding/claim-controls", () => ({
  ApplicationAction: ({ label }: { label: string }) => h("button", null, label),
}));

const { ApplicationStatusView } = await import("@/components/founding/application-status");

const app = (status: "started" | "submitted") => ({
  id: "a1",
  status,
  source: "meta_ads",
  admin_note: null,
  submitted_at: null,
  decided_at: null,
});

describe("ApplicationStatusView next step", () => {
  it("shows a Create my listing button right after claiming", () => {
    const html = renderToStaticMarkup(h(ApplicationStatusView, { application: app("started"), listing: null, checklist: [], full: false }));
    expect(html).toContain("One step left: your listing");
    expect(html).toMatch(/href="\/vendor-signup"[^>]*>Create my listing/);
  });

  it("doesn't show it once there is a listing", () => {
    const html = renderToStaticMarkup(
      h(ApplicationStatusView, { application: app("submitted"), listing: { id: "l1", name: "DJ X", status: "pending_review" }, checklist: [], full: false })
    );
    expect(html).not.toContain("Create my listing");
  });
});
