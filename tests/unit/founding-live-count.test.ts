import { describe, expect, it } from "vitest";
import { countGenuineLiveListings, pickProofListings } from "@/lib/founding/live-count";

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

describe("pickProofListings (onboarding review item 3)", () => {
  const proof = (id: string, owner_user_id: string, extra: Partial<{ name: string; is_demo: boolean; avatar_url: string | null }> = {}) => ({
    id,
    owner_user_id,
    name: "Real Vendor Co",
    is_demo: false,
    avatar_url: `https://cdn.example/${id}.jpg`,
    ...extra,
  });
  const photos = (id: string, n: number) => Array.from({ length: n }, () => ({ provider_id: id }));

  it("shows only genuine, complete listings with a photo, up to three, in order", () => {
    const listings = [
      proof("a", "o1"),
      proof("b", "o2"), // only 2 photos
      proof("c", "o3", { avatar_url: null }),
      proof("d", "o4", { is_demo: true }),
      proof("e", "adm"),
      proof("f", "o5"),
      proof("g", "o6", { name: "Test Listing" }),
      proof("h", "o7"),
      proof("i", "o8"),
    ];
    const owners = ["o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8"].map((id) => owner(id)).concat(owner("adm", { role: "admin" }));
    const counts = {
      photos: ["a", "c", "d", "e", "f", "g", "h", "i"].flatMap((id) => photos(id, 3)).concat(photos("b", 2)),
      packages: ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id) => ({ provider_id: id })),
    };
    expect(pickProofListings(listings, owners, [], counts).map((l) => l.id)).toEqual(["a", "f", "h"]);
    // A listing without an active package isn't complete.
    expect(pickProofListings([proof("a", "o1")], owners, [], { photos: photos("a", 3), packages: [] })).toEqual([]);
  });
});
