import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// iPhone Safari turns phone-number-like text into <a href="tel:"> links before
// React hydrates, so the client HTML no longer matches the server's and React
// throws #418 (seen on a vendor profile 15 Nov, fixed by #47). Keep detection
// off in the root layout's metadata.
describe("root layout", () => {
  it("disables Safari's telephone/date/address/email auto-linking", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/formatDetection:\s*\{\s*telephone:\s*false,\s*date:\s*false,\s*address:\s*false,\s*email:\s*false\s*\}/);
  });
});
