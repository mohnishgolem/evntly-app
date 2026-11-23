import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { requireAdminPage } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { AdminReviewToggle } from "@/components/admin-review-toggle";

const SHARE_LABEL: Record<string, string> = { share_story: "Story link", share_link: "copied link", share_qr: "QR card" };

export const metadata: Metadata = {
  title: "Reviews",
  robots: { index: false, follow: false },
};

// Reviews go live straight away; this is where admins check them and hide any
// that look fake (hidden reviews leave the profile and the rating).
export default async function AdminReviewsPage() {
  const { needsEnrol } = await requireAdminPage("/admin/reviews");
  if (needsEnrol) return <AdminMfaRequired />;

  const admin = createAdminClient();
  const { data: rows } = admin
    ? await admin
        .from("reviews")
        .select("id, created_at, provider_id, reviewer_name, reviewer_email, rating, comment, event_type, hidden_at, hidden_reason, source, share_source")
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] };
  const reviews = rows ?? [];
  const vendorIds = [...new Set(reviews.map((r) => r.provider_id))];
  const { data: vendors } =
    admin && vendorIds.length ? await admin.from("service_providers").select("id, name, owner_email").in("id", vendorIds) : { data: [] };
  const vendor = new Map((vendors ?? []).map((v) => [v.id, v]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading
        title="Reviews"
        description={`${reviews.length} review${reviews.length === 1 ? "" : "s"}, newest first (${reviews.filter((r) => r.source === "past_client").length} from past clients). They're live as soon as they're posted; hide any that look fake.`}
      />
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {reviews.map((r) => {
            const v = vendor.get(r.provider_id);
            // A reviewer on the same email domain as the owner is worth a look.
            const sameDomain =
              r.source === "past_client" &&
              !!v?.owner_email && r.reviewer_email.split("@")[1]?.toLowerCase() === v.owner_email.split("@")[1]?.toLowerCase() &&
              !/^(gmail|outlook|hotmail|yahoo|icloud|live|bigpond)\./i.test(r.reviewer_email.split("@")[1] ?? "");
            return (
              <li key={r.id} className={r.hidden_at ? "bg-muted/40 px-4 py-4 opacity-70" : "px-4 py-4"}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      <Link href={`/vendor/${r.provider_id}`} className="hover:underline">
                        {v?.name?.trim() ?? r.provider_id}
                      </Link>
                      <span className="ml-2 inline-flex items-center gap-0.5">
                        <Star className="size-3.5 fill-champagne text-champagne" aria-hidden />
                        {r.rating}
                      </span>
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {r.source === "past_client" ? "Past client" : "Evntly booking"}
                        {r.share_source ? ` · via ${SHARE_LABEL[r.share_source] ?? r.share_source}` : ""}
                      </span>
                      {r.hidden_at && <span className="ml-2 text-xs font-semibold text-destructive">Hidden</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.reviewer_name ?? "Anonymous"} · {r.reviewer_email} · {r.created_at.slice(0, 10)}
                      {r.event_type ? ` · ${r.event_type}` : ""}
                    </p>
                    {sameDomain && <p className="mt-1 text-xs font-medium text-warning">Same email domain as the vendor</p>}
                    {r.comment && <p className="mt-2 whitespace-pre-line text-muted-foreground">{r.comment}</p>}
                    {r.hidden_reason && <p className="mt-1 text-xs text-muted-foreground">Hidden because: {r.hidden_reason}</p>}
                  </div>
                  <AdminReviewToggle reviewId={r.id} hidden={!!r.hidden_at} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
