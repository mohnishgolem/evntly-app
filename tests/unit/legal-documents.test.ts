import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";
import { tokenizeInline } from "@/lib/legal/inline";
import { friendlyLegalError, LEGAL_REQUIRED_MESSAGE } from "@/lib/legal/status";

const allText = (doc: (typeof LEGAL_DOCUMENTS)[number]) =>
  [doc.summary, ...(doc.keyPoints ?? []), ...doc.sections.flatMap((s) => [s.title, ...s.blocks.flatMap((b) => (typeof b === "string" ? [b] : "list" in b ? b.list : [b.note]))])].join("\n");

describe("legal documents", () => {
  it("each page shows the version the database requires acceptance of", () => {
    for (const doc of LEGAL_DOCUMENTS) expect(doc.version).toBe(LEGAL_VERSIONS[doc.key]);
    const sql = readFileSync("supabase/migrations/20261029090000_legal_consents.sql", "utf8");
    for (const [doc, version] of Object.entries(LEGAL_VERSIONS)) {
      expect(sql).toContain(`('${doc}', '${version}')`);
    }
  });

  it("names the sole trader correctly and never as a company", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      const text = allText(doc);
      expect(text).toContain("Sai Mohnish Golem trading as Evntly (ABN 49 193 658 959)");
      expect(text).not.toMatch(/Pty\.? Ltd|Evntly Pty|incorporated/i);
    }
  });

  it("never claims escrow, payment protection or that Evntly holds booking funds", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      for (const line of allText(doc).split("\n")) {
        if (/escrow|payment protection|payment guarantee|held by Evntly|Evntly holds/i.test(line)) {
          // Only allowed as a denial.
          expect(line, `${doc.key}: ${line}`).toMatch(/not|n't|never|no /i);
        }
      }
    }
  });

  it("keeps the ACL non-exclusion statement in the customer documents", () => {
    const terms = allText(LEGAL_DOCUMENTS.find((d) => d.key === "customer_terms")!);
    expect(terms).toMatch(/Nothing in these Terms excludes, restricts or modifies/);
    expect(allText(LEGAL_DOCUMENTS.find((d) => d.key === "cancellation_policy")!)).toMatch(/can't reverse|cannot reverse|reverse, refund or recover/i);
  });

  it("doesn't claim AI processing", () => {
    const privacy = allText(LEGAL_DOCUMENTS.find((d) => d.key === "privacy_policy")!);
    expect(privacy).toMatch(/don't currently use artificial intelligence/);
  });

  it("states vendor fees are free at launch and invents no commission rate", () => {
    const vendor = allText(LEGAL_DOCUMENTS.find((d) => d.key === "vendor_agreement")!);
    expect(vendor).toMatch(/Current fees: \$0/);
    expect(vendor).not.toMatch(/\d+(\.\d+)?\s?%/);
  });
});

describe("inline markup", () => {
  it("parses bold, links and placeholders", () => {
    expect(tokenizeInline("a **b** [c](/d) [[TBC: e]] f")).toEqual([
      { type: "text", value: "a " },
      { type: "bold", value: "b" },
      { type: "text", value: " " },
      { type: "link", value: "c", href: "/d" },
      { type: "text", value: " " },
      { type: "tbc", value: "e" },
      { type: "text", value: " f" },
    ]);
  });
});

describe("friendlyLegalError", () => {
  it("maps the enforcement trigger's error and passes others through", () => {
    expect(friendlyLegalError("LEGAL_ACCEPTANCE_REQUIRED: customer_terms")).toBe(LEGAL_REQUIRED_MESSAGE);
    expect(friendlyLegalError("Something else")).toBe("Something else");
  });
});
