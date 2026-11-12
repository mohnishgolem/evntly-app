import { describe, expect, it } from "vitest";
import { describeError } from "@/lib/client-error";

describe("describeError", () => {
  it("reads Error instances, including subclasses and empty messages", () => {
    const d = describeError(new Error("boom"));
    expect(d?.message).toBe("boom");
    expect(d?.stack).toContain("boom");
    expect(describeError(new TypeError("x is not a function"))?.message).toBe("x is not a function");
    expect(describeError(new Error(""))?.message).toMatch(/^Error/); // falls back to the stack's first line
  });

  it("reads errors from another realm (fail instanceof Error)", () => {
    const foreign = { message: "from iframe", stack: "at x (y.js:1:2)", line: 1, column: 2 };
    expect(describeError(foreign)).toEqual({ message: "from iframe", stack: "at x (y.js:1:2)" });
  });

  it("keeps Supabase-style error objects", () => {
    expect(describeError({ message: "permission denied", code: "42501" })?.message).toBe("permission denied");
  });

  it("skips only WebKit location-only objects from injected in-app-browser scripts", () => {
    expect(describeError({ line: 1, column: 4222, sourceURL: "https://evntlyapp.com/signup" })).toBeNull();
    expect(describeError({ line: 1, column: 4222 })).toBeNull();
    // A location plus anything else is still reported.
    expect(describeError({ line: 1, column: 2, sourceURL: "x", code: 7 })).not.toBeNull();
  });

  it("reports everything it reported before", () => {
    expect(describeError("plain")).toEqual({ message: "plain", stack: "" });
    expect(describeError({ code: 42 })).toEqual({ message: '{"code":42}', stack: "" });
    expect(describeError({})).toEqual({ message: "{}", stack: "" });
    expect(describeError(null)).toEqual({ message: "null", stack: "" });
    expect(describeError(7)).toEqual({ message: "7", stack: "" });
    expect(describeError(undefined)).toBeNull();
    expect(describeError("")).toBeNull();
  });
});
