import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { QuoteList } from "@/components/quote-list";
import { DashboardNav } from "@/components/dashboard-nav";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/events", label: "My Events" },
  { href: "/dashboard/event-feed", label: "Event Feed" },
  { href: "/dashboard/quotes", label: "Quotes" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/bundles", label: "Bundles" },
  { href: "/messages", label: "Messages" },
];

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
        Track quotes you&apos;ve asked vendors for, and accept the ones you like.
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
        <QuoteList quotes={quotes} />
      )}
    </div>
  );
}
