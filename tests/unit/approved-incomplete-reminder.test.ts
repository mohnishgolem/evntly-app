import { describe, expect, it } from "vitest";
import { missingForEmail, parseSkipList, pickApprovedIncompleteReminders } from "@/lib/listing-completion";
import { reminderEmail } from "@/lib/listing-reminder-email";

const listings = [
  { id: "a", name: "Empty DJ", owner_user_id: "u1" },
  { id: "b", name: "Complete Photos", owner_user_id: "u2" },
  { id: "c", name: "Photos Only", owner_user_id: "u3" },
];
const rows = {
  photos: [{ provider_id: "b" }, { provider_id: "b" }, { provider_id: "b" }, { provider_id: "c" }, { provider_id: "c" }, { provider_id: "c" }],
  packages: [{ provider_id: "b" }],
  sent: [] as { provider_id: string; kind: string }[],
};

describe("pickApprovedIncompleteReminders", () => {
  it("picks live listings missing photos or a package, never complete ones", () => {
    expect(pickApprovedIncompleteReminders(listings, rows, new Set()).map((d) => [d.providerId, d.photos, d.packages])).toEqual([
      ["a", 0, 0],
      ["c", 3, 0],
    ]);
  });

  it("skips listings already emailed (draft reminders don't count) and ids on the skip list", () => {
    const sent = [
      { provider_id: "a", kind: "approved_incomplete" },
      { provider_id: "c", kind: "24h" },
    ];
    expect(pickApprovedIncompleteReminders(listings, { ...rows, sent }, new Set()).map((d) => d.providerId)).toEqual(["c"]);
    expect(pickApprovedIncompleteReminders(listings, rows, parseSkipList("c,\n a"))).toEqual([]);
  });
});

describe("parseSkipList", () => {
  it("reads comma, space or newline separated ids and ignores blanks", () => {
    expect([...parseSkipList(" x, y\nz ,, ")]).toEqual(["x", "y", "z"]);
    expect(parseSkipList(null).size).toBe(0);
  });
});

describe("approved-incomplete email wording", () => {
  it("names exactly what's missing", () => {
    expect(missingForEmail(0, 0)).toBe("3 photos of your work and one package (what's included and the price)");
    expect(missingForEmail(2, 1)).toBe("1 more photo of your work");
    expect(missingForEmail(3, 0)).toBe("one package (what's included and the price)");
  });

  it("is a live-listing nudge with the bug apology, the starter-package hint and the done-for-you option", () => {
    const e = reminderEmail({ providerId: "a", name: "DJ Example", ownerUserId: "u", kind: "approved_incomplete", photos: 0, packages: 0 });
    expect(e.subject).toBe("DJ Example is live on Evntly, but customers can't see your work yet");
    expect(e.lines.join(" ")).toContain("still needs 3 photos of your work and one package");
    expect(e.lines.join(" ")).toContain("drafted a first package");
    expect(e.lines.join(" ")).toContain("that was our bug");
    expect(e.lines.join(" ")).toContain("hello@evntlyapp.com");
    expect(e.cta.path).toBe("/vendor-dashboard/finish");
    // No commission or "free forever" promises.
    expect(JSON.stringify(e)).not.toMatch(/commission|free/i);
  });

  it("doesn't mention a drafted package when there already is one", () => {
    const e = reminderEmail({ providerId: "a", name: "X", ownerUserId: "u", kind: "approved_incomplete", photos: 1, packages: 1 });
    expect(e.lines.join(" ")).not.toContain("drafted a first package");
  });

  it("keeps the draft reminder wording unchanged", () => {
    const e = reminderEmail({ providerId: "a", name: "Lens", ownerUserId: "u", kind: "24h", photos: 1, packages: 0 });
    expect(e.subject).toBe("Finish your Lens listing on Evntly");
    expect(e.lines[0]).toBe("Lens is saved as a draft. To send it for review, add 2 more photos of your work and one package (what's included and the price).");
  });
});
