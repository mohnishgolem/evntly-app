import { calendarFeedForToken } from "@/lib/supabase/admin";
import { buildCalendar, parseEventTime, type IcsEvent } from "@/lib/ics";
import { personDisplayName } from "@/lib/messages";
import { SITE_URL } from "@/lib/config";

// Subscribed calendar for a vendor's bookings — Apple Calendar, Google
// Calendar and Outlook poll this URL. The token in the path is the only
// credential (see calendar_feed_tokens); vendors can reset it from
// /vendor-dashboard/calendar. Cancelled bookings drop out of the feed,
// which removes them from subscribed calendars on the next refresh.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const feed = await calendarFeedForToken(token);
  if (!feed) return new Response("Not found", { status: 404 });

  const manageUrl = `${SITE_URL}/vendor-dashboard/bookings`;
  const events: IcsEvent[] = feed.bookings.map((b) => {
    const customer = personDisplayName(b.client_name, b.client_email);
    const awaiting = b.status === "pending";
    return {
      uid: `booking-${b.id}@evntly`,
      date: b.event_date,
      startTime: parseEventTime(b.event_time),
      durationHours: b.duration_hours ? Number(b.duration_hours) : null,
      summary: `${awaiting ? "[Awaiting confirmation] " : ""}Evntly: ${customer}`,
      description: [
        b.provider_name ? `Listing: ${b.provider_name}` : null,
        `Status: ${awaiting ? "Awaiting your confirmation" : b.status === "completed" ? "Completed" : "Confirmed"}`,
        `Manage on Evntly: ${manageUrl}`,
      ]
        .filter(Boolean)
        .join("\n"),
      location: b.event_address,
      url: manageUrl,
      status: awaiting ? "TENTATIVE" : "CONFIRMED",
      updatedAt: b.updated_at,
    };
  });

  return new Response(buildCalendar("Evntly bookings", events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="evntly-bookings.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
