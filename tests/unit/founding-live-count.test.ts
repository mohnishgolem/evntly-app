import { describe, expect, it } from "vitest";
import { countGenuineLiveListings } from "@/lib/founding/live-count";

const owner = (id: string, extra: Partial<{ role: string; email: string; suspended_at: string | null }> = {}) => ({
  id,
  role: "vendor",
  email: `${id}@gmail.com`,
  suspended_at: null,
  ...extra,
});
const listing = (owner_user_id: string | null, name = "Real Vendor Co", is_demo = false) => ({ owner_user_id, name, is_demo });

describe("countGenuineLiveListings", () => {
  it("counts genuine vendors only", () => {
    const listings = [
      listing("real1"),
      listing("real2", "Sur le Coeur Photography"),
      listing("demo", "Sample DJ", true),
      listing("susp"),
      listing("adm"),
      listing("team"),
      listing("qa_camp"),
      listing("named", "QA Test Photos"),
      listing(null),
      listing("ghost"),
    ];
    const owners = [
      owner("real1"),
      owner("real2"),
      owner("demo"),
      owner("susp", { suspended_at: "2026-11-01T00:00:00Z" }),
      owner("adm", { role: "admin" }),
      owner("team", { email: "qa+1@evntlyapp.com" }),
      owner("qa_camp"),
      owner("named"),
    ];
    const apps = [{ user_id: "qa_camp", campaign: "qa_claim_test" }, { user_id: "real1", campaign: "v5b_dj" }];
    expect(countGenuineLiveListings(listings, owners, apps)).toBe(2);
  });

  it("is zero with no listings", () => {
    expect(countGenuineLiveListings([], [], [])).toBe(0);
  });
});
