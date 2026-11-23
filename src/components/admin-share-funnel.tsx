import Link from "next/link";
import type { ShareFunnelRow, ShareFunnelVendorRow } from "@/lib/data/admin";

const CHANNELS: Record<string, string> = {
  share_story: "Story link",
  share_link: "Copied link",
  share_qr: "QR card",
};

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");

// Share profile funnel: visits from a vendor's shared links → new verified
// customer accounts → quote requests, per channel. "Prepared" is shown apart:
// a save or copy shows a vendor got ready to share, not that they posted.
export function AdminShareFunnel({ rows, byVendor, days }: { rows: ShareFunnelRow[]; byVendor: ShareFunnelVendorRow[]; days: number }) {
  const total = rows.reduce(
    (t, r) => ({
      source: "total",
      visitors: t.visitors + r.visitors,
      accounts: t.accounts + r.accounts,
      verified: t.verified + r.verified,
      quotes: t.quotes + r.quotes,
      quotesNew: t.quotesNew + r.quotesNew,
      reviews: t.reviews + r.reviews,
      prepared: t.prepared + r.prepared,
    }),
    { source: "total", visitors: 0, accounts: 0, verified: 0, quotes: 0, quotesNew: 0, reviews: 0, prepared: 0 }
  );
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Share profile funnel, last {days} days</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Channel</th>
              <th className="px-2 py-2 text-right font-medium">Profile visitors</th>
              <th className="px-2 py-2 text-right font-medium">New accounts</th>
              <th className="px-2 py-2 text-right font-medium">Verified</th>
              <th className="px-2 py-2 text-right font-medium">Quote requests</th>
              <th className="px-4 py-2 text-right font-medium">Reviews</th>
            </tr>
          </thead>
          <tbody>
            {[...rows, total].map((r) => (
              <tr key={r.source} className={r.source === "total" ? "font-semibold" : "border-b border-border"}>
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  {CHANNELS[r.source] ?? "All channels"}
                </th>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.visitors}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.accounts}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {r.verified}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{pct(r.verified, r.visitors)}</span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {r.quotes}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground" title="From the verified new accounts">
                    {r.quotesNew} new
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.reviews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ByVendor rows={byVendor} />
      <p className="text-sm">
        Shares prepared by vendors: <strong className="tabular-nums">{total.prepared}</strong>{" "}
        <span className="text-muted-foreground">
          (Story {rows.find((r) => r.source === "share_story")?.prepared ?? 0} · link {rows.find((r) => r.source === "share_link")?.prepared ?? 0} · QR card{" "}
          {rows.find((r) => r.source === "share_qr")?.prepared ?? 0}). A save or copy shows a vendor got ready to share — not that they posted.
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Last {days} days. Visitors are browsers that opened a vendor profile from a shared link or QR code (anonymous; Do Not Track is respected).
        New accounts are customers whose sign-up started from that visit (to request a quote or write a review); verified means their email is confirmed. Reviews are those written from a shared profile. Quote requests carry the
        channel of the visit they came from (30-day window on that vendor&apos;s page). The Story link is only counted as Story when the vendor
        pasted the Story tab&apos;s link into their sticker. Admin activity is excluded.
      </p>
    </div>
  );
}

const SHORT: Record<string, string> = { share_story: "Story", share_link: "Link", share_qr: "QR" };

// One block per vendor (most visitors first), a line per channel they used.
function ByVendor({ rows }: { rows: ShareFunnelVendorRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No vendor has had share activity yet.</p>;
  const vendors = new Map<string, { name: string; rows: ShareFunnelVendorRow[] }>();
  for (const r of rows) {
    const v = vendors.get(r.vendorId) ?? { name: r.vendorName, rows: [] };
    v.rows.push(r);
    vendors.set(r.vendorId, v);
  }
  const sum = (rs: ShareFunnelVendorRow[], k: "visitors" | "verified" | "quotes" | "reviews" | "prepared") => rs.reduce((t, r) => t + r[k], 0);
  const sorted = [...vendors.entries()].sort(([, a], [, b]) => sum(b.rows, "visitors") - sum(a.rows, "visitors") || a.name.localeCompare(b.name));
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">Share profile funnel by vendor</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">Vendor · channel</th>
            <th className="px-2 py-2 text-right font-medium">Visitors</th>
            <th className="px-2 py-2 text-right font-medium">Verified accounts</th>
            <th className="px-2 py-2 text-right font-medium">Quote requests</th>
            <th className="px-2 py-2 text-right font-medium">Reviews</th>
            <th className="px-4 py-2 text-right font-medium">Prepared</th>
          </tr>
        </thead>
        {sorted.map(([id, v]) => (
          <tbody key={id} className="border-b border-border last:border-0">
            <tr className="font-semibold">
              <th scope="rowgroup" className="px-4 pt-2.5 pb-1 text-left">
                <Link href={`/vendor/${id}`} className="hover:underline">
                  {v.name}
                </Link>
              </th>
              <td className="px-2 pt-2.5 pb-1 text-right tabular-nums">{sum(v.rows, "visitors")}</td>
              <td className="px-2 pt-2.5 pb-1 text-right tabular-nums">{sum(v.rows, "verified")}</td>
              <td className="px-2 pt-2.5 pb-1 text-right tabular-nums">{sum(v.rows, "quotes")}</td>
              <td className="px-2 pt-2.5 pb-1 text-right tabular-nums">{sum(v.rows, "reviews")}</td>
              <td className="px-4 pt-2.5 pb-1 text-right tabular-nums">{sum(v.rows, "prepared")}</td>
            </tr>
            {v.rows.map((r) => (
              <tr key={r.source} className="text-muted-foreground">
                <th scope="row" className="px-4 py-1 pl-8 text-left font-normal">
                  {SHORT[r.source] ?? r.source}
                </th>
                <td className="px-2 py-1 text-right tabular-nums">{r.visitors}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.verified}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.quotes}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.reviews}</td>
                <td className="px-4 py-1 text-right tabular-nums">{r.prepared}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
