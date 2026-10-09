import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/event-feed", label: "Event Feed" },
  { href: "/dashboard/quotes", label: "Quotes" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/bundles", label: "Bundles" },
  { href: "/messages", label: "Messages" },
];

export default async function CustomerBundlesPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/dashboard/bundles");

  const email = session.user.email as string;
  const supabase = await createClient();
  const [{ data: bookings }, { data: threads }] = await Promise.all([
    supabase
      .from("bundle_bookings")
      .select("*")
      .eq("customer_email", email)
      .order("event_date", { ascending: false }),
    supabase.from("group_chat_threads").select("id, bundle_booking_id").eq("customer_email", email),
  ]);

  const threadByBooking = new Map((threads ?? []).map((t) => [t.bundle_booking_id, t.id]));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Your bundle bookings</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Multi-vendor bundles you&apos;ve booked, with a group chat for every vendor involved.
      </p>

      <DashboardNav items={NAV_ITEMS} />

      {!bookings || bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <p className="mb-4 text-muted-foreground">No bundle bookings yet.</p>
          <Link href="/bundles" className="text-sm font-semibold underline underline-offset-2">
            Browse bundles
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const threadId = threadByBooking.get(b.id);
            return (
              <div key={b.id} className="rounded-2xl border border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{b.combined_package_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.event_date}
                      {b.event_address ? ` · ${b.event_address}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {b.vendor_count} vendors · ${b.total_amount}
                    </p>
                  </div>
                  <span className="text-sm font-medium capitalize text-muted-foreground">
                    {b.status}
                  </span>
                </div>
                {threadId && (
                  <Link
                    href={`/messages/group/${threadId}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-2"
                  >
                    <MessageCircle className="h-4 w-4" /> Open group chat
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
