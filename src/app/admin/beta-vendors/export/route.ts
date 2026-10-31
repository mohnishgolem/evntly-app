import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/data/user";
import { getBetaAdminData } from "@/lib/data/admin-founding";
import { toCsv } from "@/lib/founding/csv";
import { sourceLabel } from "@/lib/founding/sources";

// Recruitment results as CSV: one row per waitlist contact or applicant.
// MFA-verified admins only (the data reads are admin-only under RLS too).
export async function GET() {
  const { admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return new NextResponse("Not authorized", { status: 403 });

  const { rows } = await getBetaAdminData();
  const csv = toCsv(
    [
      "email", "first_name", "business_name", "category", "on_waitlist", "invite_consent", "unsubscribed",
      "invite_status", "delivery", "times_sent", "last_sent", "opened", "clicked", "claimed",
      "application_status", "source", "listing_name", "listing_status", "profile_complete_pct", "submitted", "decided",
    ],
    rows.map((r) => [
      r.email, r.firstName, r.businessName, r.category, r.onWaitlist, r.consent, r.unsubscribed,
      r.inviteStatus, r.delivery, r.sendCount, r.lastSentAt, r.openedAt, r.clickedAt, r.claimedAt,
      r.applicationStatus, r.source ? sourceLabel(r.source) : null, r.listingName, r.listingStatus, r.onboardingPercent, r.submittedAt, r.decidedAt,
    ]),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="evntly-beta-vendors-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
