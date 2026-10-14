import { requireVendor } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { VENDOR_NAV_ITEMS } from "@/lib/nav";
import { VendorCalendar } from "@/components/vendor-calendar";
import { personDisplayName } from "@/lib/messages";
import { CalendarSync } from "@/components/calendar-sync";
import { SITE_URL } from "@/lib/config";

export default async function VendorCalendarPage() {
  const session = await requireVendor("/vendor-dashboard/calendar");

  const supabase = await createClient();
  const [{ data: listings }, { data: bookings }, { data: feedToken }] = await Promise.all([
    supabase
      .rpc("my_service_providers")
      .select("id, name, unavailable_dates, weekly_unavailable_days, available")
      .order("created_at", { ascending: true }),
    supabase
      .from("bookings")
      .select("id, provider_id, event_date, event_time, status, client_name, client_email, total_price")
      .eq("provider_owner_email", session.user.email as string)
      .neq("status", "cancelled"),
    // Created on first visit; see calendar_feed_tokens.
    supabase.rpc("my_calendar_feed_token"),
  ]);

  // Event dates are Sydney calendar days; "today" must be too, not UTC.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Calendar</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Your bookings at a glance, and the days you&apos;re not available.
      </p>

      <DashboardNav items={VENDOR_NAV_ITEMS} />

      {listings && listings.length > 0 && (
        <VendorCalendar
          listings={listings}
          today={today}
          bookings={(bookings ?? []).map((b) => ({
            id: b.id,
            provider_id: b.provider_id,
            event_date: b.event_date,
            event_time: b.event_time,
            status: b.status,
            total_price: b.total_price,
            client_label: personDisplayName(b.client_name, b.client_email),
          }))}
        />
      )}

      {feedToken && (
        <div className="mt-6">
          <CalendarSync feedUrl={`${SITE_URL}/calendar-feed/${feedToken}.ics`} />
        </div>
      )}
    </div>
  );
}
