import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { vendorAgreement } from "@/lib/legal/documents/vendor-agreement";
import { MIN_PACKAGES, MIN_PHOTOS } from "@/lib/listing-completion";
import { FEE_CHANGE_PROMISE, FEE_SUMMARY, PHOTO_RULE, SETUP_TIME } from "@/lib/vendor-terms";

// The fee and setup promises on vendor pages must match the Vendor Service
// Agreement (section 9 and Schedule 1) and the rules the database enforces.

const agreementText = [
  ...(vendorAgreement.keyPoints ?? []),
  ...vendorAgreement.sections.flatMap((s) => s.blocks.flatMap((b) => (typeof b === "string" ? [b] : "list" in b ? b.list : [b.note]))),
].join("\n");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "legal" ? [] : sourceFiles(full);
    return /\.(tsx?|mdx?)$/.test(name) ? [full] : [];
  });
}

describe("vendor fee promise", () => {
  it("matches Schedule 1: currently free, no subscription, commission or booking fees", () => {
    expect(agreementText).toContain("Listing on Evntly is currently free: no subscription, no commission and no booking fees.");
    expect(agreementText).toContain("**Current fees: $0.**");
    expect(FEE_SUMMARY).toBe("Listing on Evntly is currently free: no subscription, no commission and no booking fees.");
  });

  it("matches section 9: at least 30 days' notice by email, and only once accepted", () => {
    expect(agreementText).toMatch(/at least 30 days' notice by email before introducing or increasing any fee/);
    expect(agreementText).toMatch(/only once you've accepted the updated Schedule 1/);
    expect(FEE_CHANGE_PROMISE).toMatch(/at least 30 days' notice by email/);
    expect(FEE_CHANGE_PROMISE).toMatch(/only applies once you accept it/);
  });

  it("never adds conditions the agreement doesn't have", () => {
    // The agreement has no beta end date and no 200-vendor limit on free listing.
    const offenders = sourceFiles("src")
      .filter((f) => !f.endsWith("vendor-terms.ts"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        return [
          /free for the first 200/i,
          /free during the beta/i,
          /no subscription fee during the beta/i,
          /taking part in the beta is free/i,
        ]
          .filter((re) => re.test(text))
          .map((re) => `${f}: ${re}`);
      });
    expect(offenders).toEqual([]);
  });
});

describe("setup promises", () => {
  it("states the photo and package minimum the database enforces", () => {
    expect(MIN_PHOTOS).toBe(3);
    expect(MIN_PACKAGES).toBe(1);
    expect(PHOTO_RULE).toContain(`${MIN_PHOTOS} photos`);
    expect(PHOTO_RULE).toContain("one package");
  });

  it("uses one setup time everywhere and never says photos can wait until after submitting", () => {
    expect(SETUP_TIME).toBe("about 10 minutes");
    const offenders = sourceFiles("src").flatMap((f) => {
      const text = readFileSync(f, "utf8");
      return [/setting up takes about 5 minutes/i, /photos can come after you submit/i, /add photos after you submit/i]
        .filter((re) => re.test(text))
        .map((re) => `${f}: ${re}`);
    });
    expect(offenders).toEqual([]);
  });
});
