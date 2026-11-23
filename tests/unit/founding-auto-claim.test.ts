import { describe, expect, it } from "vitest";
import { CLAIM_PATH, isFoundingPath, wantsAutoClaim, withAutoClaim } from "@/lib/founding/sources";
import { safeNextPath } from "@/lib/safe-redirect";

// Onboarding plan item 5: after signing up from "Claim", the claim page
// claims for the vendor instead of asking them to tap Claim again.
describe("auto-claim after sign-up", () => {
  it("adds go=1 and keeps the source, referral and campaign", () => {
    expect(withAutoClaim(CLAIM_PATH)).toBe(`${CLAIM_PATH}?go=1`);
    expect(withAutoClaim(`${CLAIM_PATH}?src=meta_ads&ref=abc123&utm_content=v5b_dj`)).toBe(
      `${CLAIM_PATH}?src=meta_ads&ref=abc123&utm_content=v5b_dj&go=1`
    );
    // Idempotent: a link that already has it doesn't grow.
    expect(withAutoClaim(`${CLAIM_PATH}?go=1`)).toBe(`${CLAIM_PATH}?go=1`);
  });

  it("survives the sign-up redirect as a same-site founding path", () => {
    const next = withAutoClaim(`${CLAIM_PATH}?src=instagram_dm`);
    expect(safeNextPath(next)).toBe(next);
    expect(isFoundingPath(next)).toBe(true);
  });

  it("only triggers on go=1", () => {
    expect(wantsAutoClaim({ go: "1" })).toBe(true);
    expect(wantsAutoClaim({ go: ["1", "0"] })).toBe(true);
    expect(wantsAutoClaim({ go: "true" })).toBe(false);
    expect(wantsAutoClaim({})).toBe(false);
  });
});
