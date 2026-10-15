import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/lib/json-ld";

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe("serializeJsonLd (stored XSS regression)", () => {
  const evil = { name: "</script><script>alert(1)</script>", bio: `a & b${LS}c${PS}` };

  it("cannot close the surrounding <script> element", () => {
    const out = serializeJsonLd(evil);
    for (const ch of ["<", ">", "&", LS, PS]) expect(out).not.toContain(ch);
  });

  it("still parses back to the original data", () => {
    expect(JSON.parse(serializeJsonLd(evil))).toEqual(evil);
  });
});
