// Wording of the listing completion reminder emails (sent by
// /api/cron/listing-reminders). Kept here so it can be reviewed and tested
// without the route.

import { FINISH_PATH, missingForEmail, type DueApprovedReminder, type DueListingReminder } from "@/lib/listing-completion";

export function reminderEmail(d: DueListingReminder | DueApprovedReminder) {
  if (d.kind === "approved_incomplete") {
    return {
      subject: `${d.name} is live on Evntly, but customers can't see your work yet`,
      heading: "Your listing is live, but it's missing your work",
      lines: [
        `${d.name} is live on Evntly, but it still needs ${missingForEmail(d.photos, d.packages)}. Customers tend to scroll past listings without them.`,
        d.packages < 1
          ? "We've drafted a first package from the price you gave us, so it's a few minutes on your phone."
          : "It's a few minutes on your phone.",
        "If you tried to add photos before 17 November and couldn't, that was our bug. It's fixed now, sorry.",
        "Short on time? Email hello@evntlyapp.com with 3 photos and your price list and we'll set it up for you to check.",
      ],
      cta: { label: "Add photos and a package", path: FINISH_PATH },
    };
  }
  const missing = [
    d.photos < 3 ? `${3 - d.photos} more photo${3 - d.photos === 1 ? "" : "s"} of your work` : null,
    d.packages < 1 ? "one package (what's included and the price)" : null,
  ].filter(Boolean);
  return {
    subject: d.kind === "24h" ? `Finish your ${d.name} listing on Evntly` : `Your ${d.name} listing is still a draft`,
    heading: d.kind === "24h" ? "Your listing is almost ready" : "Customers can't see your listing yet",
    lines: [
      `${d.name} is saved as a draft. To send it for review, add ${missing.join(" and ")}.`,
      "Short on time? Choose \"Set it up for me\" on the same page, send us your prices and photos, and we'll prepare it for you to check.",
    ],
    cta: { label: "Finish my listing", path: FINISH_PATH },
  };
}
