import { describe, expect, it } from "vitest";
import { cleanSearchTerm } from "@/lib/search-term";

describe("cleanSearchTerm (Explore search box → PostgREST or() filter)", () => {
  it.each([
    ["Parramatta", "Parramatta"],
    ["  North Sydney, NSW ", "North Sydney"],
    ["North Sydney NSW 2060", "North Sydney"],
    ["Bloom (decor)", "Bloom decor"],
    ["St. Peters", "St. Peters"],
    ["", ""],
    [undefined, ""],
  ])("%s → %s", (input, expected) => {
    expect(cleanSearchTerm(input)).toBe(expected);
  });

  it.each(["x%,status.neq.approved", "a),or(is_demo.eq.true", "x*\\"])(
    "can't inject filter syntax: %s",
    (input) => {
      expect(cleanSearchTerm(input)).not.toMatch(/[,()%*\\]/);
    }
  );

  it("caps the length", () => {
    expect(cleanSearchTerm("a".repeat(500))).toHaveLength(60);
  });
});
