import { describe, expect, it } from "vitest";
import { formatAbn, isValidAbn, normalizeAbn } from "@/lib/abn";

describe("ABN validation", () => {
  it("accepts real ABNs with or without spaces", () => {
    // ATO's published example and Evntly's own ABN.
    expect(isValidAbn("51 824 753 556")).toBe(true);
    expect(isValidAbn("49193658959")).toBe(true);
  });

  it("rejects bad checksums and wrong lengths", () => {
    expect(isValidAbn("51 824 753 557")).toBe(false);
    expect(isValidAbn("1234567890")).toBe(false);
    expect(isValidAbn("abcdefghijk")).toBe(false);
    expect(isValidAbn("")).toBe(false);
  });

  it("normalises and formats", () => {
    expect(normalizeAbn(" 51 824 753 556 ")).toBe("51824753556");
    expect(normalizeAbn("  ")).toBeNull();
    expect(formatAbn("51824753556")).toBe("51 824 753 556");
  });
});
