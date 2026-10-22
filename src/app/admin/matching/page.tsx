import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/data/user";
import { getMatchingReport, getMatchingSettingsForAdmin } from "@/lib/data/admin-matching";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { AdminMatchingSettings } from "@/components/admin-matching-settings";
import { categoryLabel } from "@/lib/config";
import { EXCLUSION_LABELS, type ExclusionCode } from "@/lib/matching/engine";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Matching",
  robots: { index: false, follow: false },
};

const PERIODS = [7, 30, 90];
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const label = (code: string) => EXCLUSION_LABELS[code as ExclusionCode] ?? code;

function Tile({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <dt className="text-xs text-muted-foreground">{title}</dt>
      <dd className="mt-1 text-xl font-semibold">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

export default async function AdminMatchingPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { needsEnrol } = await requireAdminPage("/admin/matching");
  if (needsEnrol) return <AdminMfaRequired />;

  const requested = Number((await searchParams).days);
  const days = PERIODS.includes(requested) ? requested : 30;
  const [report, settings] = await Promise.all([getMatchingReport(days), getMatchingSettingsForAdmin()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AdminHeading title="Matching" description="How smart matching is performing, and the knobs that control it." />

      <nav aria-label="Period" className="mb-6 flex gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/admin/matching?days=${p}`}
            aria-current={p === days ? "page" : undefined}
            className={cn(
              "flex h-9 items-center rounded-full border px-4 text-sm",
              p === days ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
            )}
          >
            {p} days
          </Link>
        ))}
      </nav>

      {!report ? (
        <p className="text-sm text-destructive">Couldn&apos;t load the report.</p>
      ) : (
        <>
          <section aria-labelledby="perf" className="mb-10">
            <h2 id="perf" className="mb-3 text-lg font-semibold">Matching performance</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile title="Searches" value={String(report.searches.total)} note={`${report.searches.events} events · category × day`} />
              <Tile
                title="Found suitable vendors"
                value={pct(report.searches.with_matches, report.searches.total)}
                note={`${pct(report.searches.with_confirmed, report.searches.total)} with a confirmed match`}
              />
              <Tile title="Had to widen the area" value={pct(report.searches.widened, report.searches.total)} />
              <Tile title="Searches with no match" value={String(report.searches.total - report.searches.with_matches)} />
            </dl>
          </section>

          <section aria-labelledby="quotes" className="mb-10">
            <h2 id="quotes" className="mb-3 text-lg font-semibold">Quotes & bookings</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile title="Quote requests" value={String(report.quotes.requests)} note={`${report.quotes.smart} from matches`} />
              <Tile
                title="Average reply time"
                value={report.quotes.avg_response_hours != null ? `${report.quotes.avg_response_hours} h` : "—"}
                note={`${report.quotes.responded} replied`}
              />
              <Tile title="Quote → booking" value={pct(report.quotes.accepted, report.quotes.decided)} note={`${report.quotes.accepted} of ${report.quotes.decided} decided quotes`} />
              <Tile
                title="Confirmed bookings"
                value={aud(Number(report.bookings.value))}
                note={`${report.bookings.confirmed} bookings · est. commission ${aud((Number(report.bookings.value) * report.bookings.commission_bps) / 10_000)}`}
              />
            </dl>
          </section>

          <section aria-labelledby="vendors" className="mb-10">
            <h2 id="vendors" className="mb-3 text-lg font-semibold">Vendor participation</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tile title="Approved real vendors" value={String(report.vendors.approved)} note="Sample listings excluded" />
              <Tile title="With packages" value={`${report.vendors.with_packages}`} note={pct(report.vendors.with_packages, report.vendors.approved)} />
              <Tile title="Service area set" value={`${report.vendors.service_area_set}`} note={pct(report.vendors.service_area_set, report.vendors.approved)} />
              <Tile title="Calendar up to date" value={`${report.vendors.calendar_current}`} note={pct(report.vendors.calendar_current, report.vendors.approved)} />
              <Tile title="Received requests" value={String(report.vendors.invited)} />
              <Tile title="Replied to requests" value={String(report.vendors.responded)} />
            </dl>
          </section>

          <section aria-labelledby="by-service" className="mb-10">
            <h2 id="by-service" className="mb-3 text-lg font-semibold">By category</h2>
            {report.by_service.length === 0 ? (
              <p className="text-sm text-muted-foreground">No searches in this period.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Category</th>
                      <th className="px-4 py-2 text-right font-medium">Searches</th>
                      <th className="px-4 py-2 text-right font-medium">No match</th>
                      <th className="px-4 py-2 text-right font-medium">Avg matches</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.by_service.map((s) => (
                      <tr key={s.service}>
                        <td className="px-4 py-2">{categoryLabel(s.service)}</td>
                        <td className="px-4 py-2 text-right">{s.total}</td>
                        <td className="px-4 py-2 text-right">{s.failures}</td>
                        <td className="px-4 py-2 text-right">{s.avg_matches}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="failures" className="mb-10">
            <h2 id="failures" className="mb-1 text-lg font-semibold">Search failures</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Events where nobody fit. The reasons show what to fix — usually which vendors to recruit.
            </p>
            {Object.keys(report.exclusions).length > 0 && (
              <p className="mb-3 flex flex-wrap gap-2 text-xs">
                {Object.entries(report.exclusions)
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, n]) => (
                    <span key={code} className="rounded-full bg-muted px-2.5 py-1">
                      {label(code)}: {n}
                    </span>
                  ))}
              </p>
            )}
            {report.failures.length === 0 ? (
              <p className="text-sm text-muted-foreground">None in this period.</p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border text-sm">
                {report.failures.map((f) => (
                  <li key={`${f.event_id}-${f.service}-${f.run_date}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span>
                      <Link href={`/admin/events/${f.event_id}#matching`} className="font-medium hover:underline">
                        {categoryLabel(f.service)} in {f.suburb ?? "?"}
                      </Link>
                      <span className="text-muted-foreground"> · event {f.event_date} · searched {f.run_date}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Object.entries(f.exclusion_counts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([c, n]) => `${label(c)} ${n}`)
                        .join(" · ") || "No vendors in this category"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="settings">
        <h2 id="settings" className="mb-3 text-lg font-semibold">Settings</h2>
        <AdminMatchingSettings enabled={settings.enabled} weights={settings.rawWeights} />
      </section>
    </div>
  );
}
