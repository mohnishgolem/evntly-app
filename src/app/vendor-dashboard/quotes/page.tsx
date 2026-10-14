import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { VendorQuoteResponse } from "@/components/vendor-quote-response";
import { DashboardNav } from "@/components/dashboard-nav";
import { cn } from "@/lib/utils";
import {
  effectiveQuoteStatus,
  quoteExpiresSoon,
  quoteTimeLeft,
} from "@/lib/quote-expiry";

const NAV_ITEMS = [
  { href: "/vendor-dashboard", label: "Listings" },
  { href: "/vendor-dashboard/event-feed", label: "Event Feed" },
  { href: "/vendor-dashboard/quotes", label: "Quotes" },
  { href: "/vendor-dashboard/bookings", label: "Bookings" },
  { href: "/vendor-dashboard/bundles", label: "Bundles" },
  { href: "/vendor-dashboard/portfolio", label: "Portfolio" },
  { href: "/messages", label: "Messages" },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Needs your response",
  quoted: "You quoted this",
  accepted: "Accepted — booking created",
  declined: "You declined",
  cancelled: "Customer cancelled",
  expired: "Expired",
};

export default async function VendorQuotesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/vendor-dashboard/quotes");

  const supabase = await createClient();
  const { data: quotes } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("vendor_email", session.user.email as string)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Quote requests</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Customers asking for a price on your services.
      </p>

      <DashboardNav items={NAV_ITEMS} />

      {!quotes || quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quote requests yet.</p>
      ) : (
        <div className="space-y-4">
          {quotes.map((q) => {
            const status = effectiveQuoteStatus(q);
            const timeLeft = quoteTimeLeft(q);
            return (
              <div key={q.id} className="rounded-2xl border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {q.client_name ?? q.client_email}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {q.event_type} · {q.event_date} · {q.location}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {q.estimated_guests} guests · Budget {q.budget_range}
                    </p>
                    {q.details && <p className="mt-1 text-sm">{q.details}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-medium text-muted-foreground">
                    {STATUS_LABEL[status] ?? status}
                  </span>
                </div>

                {timeLeft && (
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      quoteExpiresSoon(q)
                        ? "font-medium text-warning"
                        : "text-muted-foreground",
                    )}
                  >
                    {status === "pending"
                      ? `Reply ${timeLeft.replace(/^in /, "within ")} or this request expires.`
                      : `Your quote of $${q.quoted_amount} is open for the customer to accept — expires ${timeLeft}.`}
                  </p>
                )}
                {status === "expired" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {q.quoted_amount != null
                      ? "The customer didn't accept your quote in time."
                      : "This request expired before you replied."}
                  </p>
                )}

                {status === "pending" && <VendorQuoteResponse quoteId={q.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
