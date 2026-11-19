import type { ShareFunnelRow } from "@/lib/data/admin";

const CHANNELS: Record<string, string> = {
  share_story: "Story link",
  share_link: "Copied link",
  share_qr: "QR card",
};

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "–");

// Share profile funnel: visits from a vendor's shared links → new verified
// customer accounts → quote requests, per channel. "Prepared" is shown apart:
// a save or copy shows a vendor got ready to share, not that they posted.
export function AdminShareFunnel({ rows, days }: { rows: ShareFunnelRow[]; days: number }) {
  const total = rows.reduce(
    (t, r) => ({
      source: "total",
      visitors: t.visitors + r.visitors,
      accounts: t.accounts + r.accounts,
      verified: t.verified + r.verified,
      quotes: t.quotes + r.quotes,
      quotesNew: t.quotesNew + r.quotesNew,
      prepared: t.prepared + r.prepared,
    }),
    { source: "total", visitors: 0, accounts: 0, verified: 0, quotes: 0, quotesNew: 0, prepared: 0 }
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
              <th className="px-4 py-2 text-right font-medium">Quote requests</th>
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
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.quotes}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground" title="From the verified new accounts">
                    {r.quotesNew} new
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        Shares prepared by vendors: <strong className="tabular-nums">{total.prepared}</strong>{" "}
        <span className="text-muted-foreground">
          (Story {rows.find((r) => r.source === "share_story")?.prepared ?? 0} · link {rows.find((r) => r.source === "share_link")?.prepared ?? 0} · QR card{" "}
          {rows.find((r) => r.source === "share_qr")?.prepared ?? 0}). A save or copy shows a vendor got ready to share — not that they posted.
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Last {days} days. Visitors are browsers that opened a vendor profile from a shared link or QR code (anonymous; Do Not Track is respected).
        New accounts are customers whose sign-up started from that visit; verified means their email is confirmed. Quote requests carry the
        channel of the visit they came from (30-day window on that vendor&apos;s page). The Story link is only counted as Story when the vendor
        pasted the Story tab&apos;s link into their sticker. Admin activity is excluded.
      </p>
    </div>
  );
}
