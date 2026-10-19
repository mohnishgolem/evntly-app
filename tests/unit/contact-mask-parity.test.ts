import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { maskContactInfo } from "@/lib/contact-reveal";

// The database masks message text with public.mask_contact_info() (see the
// message_masking_in_db migration) and the app masks with maskContactInfo().
// Both must produce exactly contact-mask-expected.json for these cases; the
// SQL side is checked against the same files when the migration changes.
const read = (f: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "../fixtures", f), "utf8")) as string[];
const cases = read("contact-mask-cases.json");
const expected = read("contact-mask-expected.json");

describe("contact masking (JS side of the JS/SQL parity fixture)", () => {
  it("matches the shared expected output", () => {
    expect(cases.map(maskContactInfo)).toEqual(expected);
  });

  it("masks contact details and leaves ordinary text alone", () => {
    expect(expected[0]).toContain("[hidden until booking confirmed]");
    expect(expected[3]).not.toContain("example.com");
    expect(expected[7]).toBe(cases[7]); // $1200-1500 is a price range
    expect(expected[8]).toBe(cases[8]); // dates
    expect(expected[13]).toBe(cases[13]);
  });
});
