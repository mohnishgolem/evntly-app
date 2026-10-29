// The itemised parts of a quote, shown wherever a quote is (vendor's own
// cards, the customer's quote list, the comparison sheet). Server-safe.

import { formatAudDollars } from "@/lib/payments/money";

export type QuoteDetailFields = {
  quoted_amount: number | null;
  coverage_hours: number | null;
  travel_fee_cents: number | null;
  deposit_cents: number | null;
  delivery_days: number | null;
  inclusions: string[] | null;
  cancellation_terms: string | null;
  service_description: string | null;
};

export const money = (dollars: number) =>
  formatAudDollars(dollars);

export function hasQuoteDetails(q: QuoteDetailFields) {
  return (
    q.coverage_hours != null ||
    q.travel_fee_cents != null ||
    q.deposit_cents != null ||
    q.delivery_days != null ||
    (q.inclusions?.length ?? 0) > 0 ||
    !!q.cancellation_terms ||
    !!q.service_description
  );
}

export function QuoteDetails({ quote: q }: { quote: QuoteDetailFields }) {
  if (!hasQuoteDetails(q)) return null;
  const rows: [string, string][] = [];
  if (q.coverage_hours != null) rows.push(["Coverage", `${Number(q.coverage_hours)} hours`]);
  if (q.travel_fee_cents) rows.push(["Travel", `${money(q.travel_fee_cents / 100)} (included)`]);
  if (q.deposit_cents != null) rows.push(["Deposit", money(q.deposit_cents / 100)]);
  if (q.delivery_days != null) rows.push(["Delivery", q.delivery_days === 0 ? "On the day" : `Within ${q.delivery_days} days`]);
  return (
    <div className="mt-2 space-y-2 text-sm">
      {q.service_description && <p>{q.service_description}</p>}
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {(q.inclusions?.length ?? 0) > 0 && (
        <ul className="list-inside list-disc text-muted-foreground">
          {q.inclusions!.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {q.cancellation_terms && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Cancellation:</span> {q.cancellation_terms}
        </p>
      )}
    </div>
  );
}
