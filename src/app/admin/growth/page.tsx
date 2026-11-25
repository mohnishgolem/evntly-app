import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/data/user";
import { AdminHeading, AdminMfaRequired } from "@/components/admin-mfa-required";
import { AdminSpendForm, DeleteSpendButton } from "@/components/admin-growth-spend";
import { createClient } from "@/lib/supabase/server";
import { costPer, GROWTH_MEASURES, rate, sumRecent, type GrowthDay } from "@/lib/growth";

export const metadata: Metadata = { title: "Growth", robots: { index: false, follow: false } };

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
type Spend = { id: number; day: string; channel: string; audience: string; amount_cents: number; note: string | null };

async function load() {
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
  const spendTable = supabase as unknown as {
    from: (t: string) => { select: (c: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Spend[] | null }> } } };
  };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const [daily, journey, verified, spend, phone] = await Promise.all([
    rpc("admin_growth_daily", { p_days: 365 }),
    rpc("admin_vendor_journey_funnel", { p_days: 30 }),
    rpc("admin_verified_vendor_funnel"),
    spendTable.from("acquisition_spend").select("id, day, channel, audience, amount_cents, note").order("day", { ascending: false }).limit(20),
    rpc("admin_phone_agent_summary"),
  ]);
  const phoneAgent = phone.error ? null : Object.fromEntries(((phone.data ?? []) as { measure: string; value: number }[]).map((r) => [r.measure, Number(r.value)]));
  return { daily, journey, verified, spend: spend.data ?? [], today, phoneAgent };
}

const n = (v: unknown) => Number(v ?? 0);

// The daily growth dashboard: real transactions first (enquiries, bookings),
// then the vendor and customer pipelines that feed them. Admins with MFA only;
// every number excludes test/internal accounts and demo listings.
export default async function AdminGrowthPage() {
  const { needsEnrol } = await requireAdminPage("/admin/growth");
  if (needsEnrol) return <AdminMfaRequired />;
  const { daily, journey, verified, spend, today, phoneAgent } = await load();
  const rows = (daily.data ?? []) as GrowthDay[];
  const notMigrated = !!daily.error;

  const v = ((verified.data ?? []) as { is_test: boolean; accounts: number; verified: number; approved: number; completed: number }[]).filter((r) => !r.is_test);
  const vendorTotals = {
    verified: v.reduce((t, r) => t + n(r.verified), 0),
    approved: v.reduce((t, r) => t + n(r.approved), 0),
    completed: v.reduce((t, r) => t + n(r.completed), 0),
  };
  const journeyRows = (journey.data ?? []) as { step: number; stage: string; people: number }[];
  const withEnquiry = n(journeyRows.find((r) => r.step === 15)?.people);
  const all = (key: keyof GrowthDay) => sumRecent(rows, key, rows.length);
  const spend30 = sumRecent(rows, "spend_cents", 30);

  const headline = [
    { label: "Genuine enquiries (all time)", value: all("genuine_enquiries"), goal: "Phase 1 goal: 10" },
    { label: "Confirmed bookings (all time)", value: all("confirmed_bookings"), goal: "Phase 1 goal: 1" },
    { label: "Completed listings", value: vendorTotals.completed, goal: "Phase 1 goal: 20" },
    { label: "Approved vendors with an enquiry", value: withEnquiry, goal: `of ${vendorTotals.approved} approved` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AdminHeading title="Growth" description="Real transactions first. Test accounts, admins and demo listings are excluded everywhere." />
      {notMigrated && (
        <p className="mb-6 rounded-2xl bg-warning/15 p-4 text-sm">
          The growth dashboard migration (20261130100000) isn&apos;t applied yet, so daily numbers aren&apos;t available.
        </p>
      )}

      <section aria-label="Headline" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {headline.map((h) => (
          <div key={h.label} className="rounded-2xl border border-border p-4">
            <p className="text-sm text-muted-foreground">{h.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{h.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{h.goal}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Today, 7 and 30 days</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1.5 font-medium">Measure</th>
                <th className="py-1.5 text-right font-medium">Today</th>
                <th className="py-1.5 text-right font-medium">7 days</th>
                <th className="py-1.5 text-right font-medium">30 days</th>
                <th className="py-1.5 text-right font-medium">All time</th>
              </tr>
            </thead>
            <tbody>
              {GROWTH_MEASURES.map((m, i) => (
                <tr key={m.key} className={i === 7 ? "border-t-2 border-border" : "border-t border-border/60"}>
                  <td className="py-1.5">{m.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{sumRecent(rows, m.key, 1)}</td>
                  <td className="py-1.5 text-right tabular-nums">{sumRecent(rows, m.key, 7)}</td>
                  <td className="py-1.5 text-right tabular-nums">{sumRecent(rows, m.key, 30)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{all(m.key)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border">
                <td className="py-1.5">Acquisition spend (AUD)</td>
                <td className="py-1.5 text-right tabular-nums">{(sumRecent(rows, "spend_cents", 1) / 100).toFixed(0)}</td>
                <td className="py-1.5 text-right tabular-nums">{(sumRecent(rows, "spend_cents", 7) / 100).toFixed(0)}</td>
                <td className="py-1.5 text-right tabular-nums">{(spend30 / 100).toFixed(0)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{(all("spend_cents") / 100).toFixed(0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Days are Sydney days. &ldquo;All time&rdquo; covers the last 365 days. Completed and approved counts are dated when the listing reached that stage.
        </p>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Conversion, last 30 days</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt>Contacted → replied</dt>
            <dd className="text-right tabular-nums">{rate(sumRecent(rows, "replies", 30), sumRecent(rows, "vendors_contacted", 30))}</dd>
            <dt>Drafts → verified registrations</dt>
            <dd className="text-right tabular-nums">{rate(sumRecent(rows, "vendor_registrations", 30), sumRecent(rows, "listing_drafts", 30))}</dd>
            <dt>Registrations → completed listings</dt>
            <dd className="text-right tabular-nums">{rate(sumRecent(rows, "listings_completed", 30), sumRecent(rows, "vendor_registrations", 30))}</dd>
            <dt>Event plans → genuine enquiries</dt>
            <dd className="text-right tabular-nums">{rate(sumRecent(rows, "genuine_enquiries", 30), sumRecent(rows, "event_plans", 30))}</dd>
            <dt>Enquiries → confirmed bookings</dt>
            <dd className="text-right tabular-nums">{rate(sumRecent(rows, "confirmed_bookings", 30), sumRecent(rows, "genuine_enquiries", 30))}</dd>
          </dl>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">Acquisition cost, last 30 days</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt>Per verified vendor registration</dt>
            <dd className="text-right tabular-nums">{costPer(spend30, sumRecent(rows, "vendor_registrations", 30))}</dd>
            <dt>Per completed listing</dt>
            <dd className="text-right tabular-nums">{costPer(spend30, sumRecent(rows, "listings_completed", 30))}</dd>
            <dt>Per genuine enquiry</dt>
            <dd className="text-right tabular-nums">{costPer(spend30, sumRecent(rows, "genuine_enquiries", 30))}</dd>
            <dt>Per confirmed booking</dt>
            <dd className="text-right tabular-nums">{costPer(spend30, sumRecent(rows, "confirmed_bookings", 30))}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">Only spend logged below. Founder time isn&apos;t counted; note it if you want it tracked.</p>
        </div>
      </section>

      {phoneAgent && phoneAgent.calls > 0 && (
        <section className="mt-8" aria-label="AI phone agent">
          <h2 className="mb-3 text-lg font-semibold">AI phone agent</h2>
          <p className="text-sm">
            {phoneAgent.calls} calls · {phoneAgent.connected} answered · {phoneAgent.interested} interested · {phoneAgent.links_sent} links sent ·{" "}
            {phoneAgent.registrations} registrations · {phoneAgent.listings_completed} completed listings · spend ${(phoneAgent.cost_aud_cents / 100).toFixed(2)} ·{" "}
            <Link href="/admin/phone-agent" className="underline">details</Link>
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Last 14 days</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Day</th>
                {GROWTH_MEASURES.map((m) => (
                  <th key={m.key} className="py-1 text-right font-medium">
                    {m.label.replace(/ \(.*\)/, "")}
                  </th>
                ))}
                <th className="py-1 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 14).map((r) => (
                <tr key={r.day} className="border-t border-border/60">
                  <td className="py-1 whitespace-nowrap">{r.day}</td>
                  {GROWTH_MEASURES.map((m) => (
                    <td key={m.key} className="py-1 text-right tabular-nums">
                      {n(r[m.key]) || ""}
                    </td>
                  ))}
                  <td className="py-1 text-right tabular-nums">{n(r.spend_cents) ? `$${(n(r.spend_cents) / 100).toFixed(0)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Log acquisition spend</h2>
        <AdminSpendForm today={today} />
        {spend.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {spend.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-3">
                <span className="tabular-nums">{s.day}</span>
                <span>{s.channel}</span>
                <span className="text-muted-foreground">{s.audience}</span>
                <span className="font-semibold tabular-nums">${(s.amount_cents / 100).toFixed(2)}</span>
                {s.note && <span className="text-muted-foreground">{s.note}</span>}
                <DeleteSpendButton id={s.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
