import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { QuoteActions } from "@/components/quote-actions";
import { DashboardNav } from "@/components/dashboard-nav";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/quotes", label: "Quotes" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/bundles", label: "Bundles" },
  { href: "/messages", label: "Messages" },
];

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Waiting on vendor", className: "text-amber-600" },
  quoted: { label: "Quoted — review & accept", className: "text-primary" },
  accepted: { label: "Accepted", className: "text-green-600" },
  declined: { label: "Declined", className: "text-destructive" },
  cancelled: { label: "Cancelled", className: "text-muted-foreground" },
};

export default async function CustomerQuotesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/quotes");

  const supabase = await createClient();
  const { data: quotes } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("client_email", session.user.email as string)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Your quote requests</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Track quotes you've asked vendors for, and accept the ones you like.
      </p>

      <DashboardNav items={NAV_ITEMS} />

      {!quotes || quotes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <p className="mb-4 text-muted-foreground">You haven&apos;t requested any quotes yet.</p>
          <Link href="/explore" className="text-sm font-semibold underline underline-offset-2">
            Browse vendors
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {quotes.map((q) => {
            const meta = STATUS_META[q.status] ?? STATUS_META.pending;
            return (
              <div key={q.id} className="rounded-2xl border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/vendor/${q.vendor_id}`} className="font-semibold hover:underline">
                      {q.vendor_name ?? "Vendor"}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {q.event_type} · {q.event_date} · {q.location}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {q.estimated_guests} guests · Budget {q.budget_range}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1.5 text-sm font-medium ${meta.className}`}>
                    {q.status === "accepted" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : q.status === "declined" ? (
                      <XCircle className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                    {meta.label}
                  </span>
                </div>

                {q.status === "quoted" && (
                  <div className="mt-3 rounded-xl bg-secondary p-3">
                    <p className="text-sm">
                      Quoted price: <span className="font-semibold">${q.quoted_amount}</span>
                    </p>
                    {q.vendor_note && (
                      <p className="mt-1 text-sm text-muted-foreground">{q.vendor_note}</p>
                    )}
                    <QuoteActions quoteId={q.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
