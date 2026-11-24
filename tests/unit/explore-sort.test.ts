import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({}), usePathname: () => "/explore", useSearchParams: () => new URLSearchParams() }));
const { SORTS, sortVendors } = await import("@/components/explore-results");

const v = (id: string, rating: number | null, review_count: number | null) => ({ id, rating, review_count });

describe("explore sorting", () => {
  const vendors = [v("a", null, 0), v("b", 4.8, 3), v("c", 5, 1), v("d", 4.8, 12), v("e", 0, 0)];

  it("keeps the server's recommended order by default", () => {
    expect(sortVendors(vendors, "").map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(sortVendors(vendors, "price").map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("top rated: rating first, more reviews breaks ties, unrated last in original order", () => {
    expect(sortVendors(vendors, "rating").map((x) => x.id)).toEqual(["c", "d", "b", "a", "e"]);
  });

  it("most reviewed: review count first, then rating", () => {
    expect(sortVendors(vendors, "reviews").map((x) => x.id)).toEqual(["d", "b", "c", "a", "e"]);
  });

  it("doesn't change the input array", () => {
    const copy = [...vendors];
    sortVendors(vendors, "rating");
    expect(vendors).toEqual(copy);
  });

  it("offers no price sort (listings mix hourly and per-event prices)", () => {
    expect(SORTS.map((s) => s.value)).toEqual(["", "rating", "reviews"]);
  });
});
