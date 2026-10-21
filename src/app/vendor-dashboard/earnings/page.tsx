import type { Metadata } from "next";
import Link from "next/link";
import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { EarningsChart, type EarningsMonth } from "@/components/earnings-chart";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

const aud = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  completed: { label: "Earned", className: "text-success" },
  confirmed: { label: "Confirmed", className: "text-primary" },
  pending: { label: "Awaiting confirmation", className: "text-warning" },
};

// Months shown: the last 9, this one, and the next 2.
const MONTHS_BACK = 9;
const MONTHS_AHEAD = 2;

export default async function VendorEarningsPage() {
  const session = await requireVendor("/vendor-dashboard/earnings");

  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("id, event_date, status, total_price, client_label, provider_name")
    .eq("provider_owner_user_id", session.user.id)
    .neq("status", "cancelled")
    .order("event_date", { ascending: false });
  const bookings = data ?? [];

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
  const thisMonth = startOfMonth(parseISO(today));

  // Australian financial year: 1 July – 30 June.
  const year = thisMonth.getFullYear();
  const fyStartYear = thisMonth.getMonth() >= 6 ? year : year - 1;
  const fyStart = `${fyStartYear}-07-01`;
  const fyEnd = `${fyStartYear + 1}-06-30`;
  const fyLabel = `FY ${fyStartYear}–${String(fyStartYear + 1).slice(2)}`;

  const price = (b: (typeof bookings)[number]) => Number(b.total_price ?? 0);
  const sum = (rows: typeof bookings) => rows.reduce((t, b) => t + price(b), 0);

  const completed = bookings.filter((b) => b.status === "completed");
  const earnedFy = sum(completed.filter((b) => b.event_date >= fyStart && b.event_date <= fyEnd));
  const upcoming = bookings.filter((b) => b.status === "confirmed" && b.event_date >= today);
  const awaiting = bookings.filter((b) => b.status === "pending");
  const valued = bookings.filter((b) => b.status !== "pending" && price(b) > 0);
  const average = valued.length ? sum(valued) / valued.length : 0;

  const months: EarningsMonth[] = Array.from({ length: MONTHS_BACK + 1 + MONTHS_AHEAD }, (_, i) => {
    const d = addMonths(thisMonth, i - MONTHS_BACK);
    const key = format(d, "yyyy-MM");
    const inMonth = bookings.filter((b) => b.event_date.startsWith(key));
    return {
      key,
      label: format(d, "MMM"),
      fullLabel: format(d, "MMMM yyyy"),
      earned: sum(inMonth.filter((b) => b.status === "completed")),
      confirmed: sum(inMonth.filter((b) => b.status === "confirmed")),
      isFuture: d > thisMonth,
    };
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Analytics</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Earnings: what your bookings are worth — earned once you mark a booking completed.
      </p>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <p className="mb-2 font-medium">No bookings yet</p>
          <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">
            When customers accept your quotes, the value of each booking shows up here.
          </p>
          <Link href="/vendor-dashboard/event-feed" className="text-sm font-semibold underline underline-offset-2">
            Find events to quote on
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`Earned, ${fyLabel}`} value={aud(earnedFy)} />
            <Stat
              label="Upcoming confirmed"
              value={aud(sum(upcoming))}
              hint={`${upcoming.length} booking${upcoming.length === 1 ? "" : "s"}`}
            />
            <Stat
              label="Awaiting your confirmation"
              value={aud(sum(awaiting))}
              hint={
                awaiting.length > 0 ? (
                  <Link href="/vendor-dashboard/bookings" className="underline underline-offset-2">
                    Review {awaiting.length}
                  </Link>
                ) : (
                  "None"
                )
              }
            />
            <Stat label="Average booking" value={aud(average)} />
          </div>

          <EarningsChart months={months} />

          <section>
            <h2 className="mb-3 text-lg font-semibold">Bookings</h2>
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="hidden px-4 py-2 font-medium sm:table-cell">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.slice(0, 30).map((b) => {
                    const meta = STATUS_LABEL[b.status];
                    return (
                      <tr key={b.id} className="border-t border-border">
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {format(parseISO(b.event_date), "d MMM yyyy")}
                        </td>
                        <td className="max-w-40 truncate px-4 py-2.5">
                          {b.client_label ?? "Customer"}
                          <span className={cn("block text-xs sm:hidden", meta?.className)}>
                            {meta?.label ?? b.status}
                          </span>
                        </td>
                        <td className={cn("hidden px-4 py-2.5 sm:table-cell", meta?.className)}>
                          {meta?.label ?? b.status}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                          {aud(price(b))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            Amounts are the agreed booking price before any Evntly fees. Payouts will show here once
            card payments go live.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
