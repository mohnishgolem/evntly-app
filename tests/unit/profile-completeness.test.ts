import { describe, expect, it } from "vitest";
import { completenessPercent, profileChecklist } from "@/lib/profile-completeness";

const base = {
  id: "v1",
  bio: "We photograph weddings and parties across Sydney, with natural light and candid moments.",
  abn: "51824753556",
  locations_serviced: ["Bondi"],
  event_types: ["Wedding"],
  photoCount: 3,
  packageCount: 1,
};

describe("profileChecklist", () => {
  it("is complete for a filled-in listing", () => {
    const items = profileChecklist(base);
    expect(items.every((i) => i.done)).toBe(true);
    expect(completenessPercent(items)).toBe(100);
  });

  it("flags missing photos, packages and a too-short bio, with where to fix each", () => {
    const items = profileChecklist({ ...base, photoCount: 1, packageCount: 0, bio: "Hi" });
    const todo = items.filter((i) => !i.done);
    expect(todo.map((i) => i.key)).toEqual(["photos", "packages", "bio"]);
    expect(todo.find((i) => i.key === "bio")?.href).toBe("/vendor-dashboard/edit/v1");
    expect(completenessPercent(items)).toBe(50);
  });

  it("treats null fields as missing", () => {
    const items = profileChecklist({ ...base, abn: null, locations_serviced: null, event_types: [] });
    expect(items.filter((i) => !i.done).map((i) => i.key)).toEqual(["areas", "events", "abn"]);
  });
});
