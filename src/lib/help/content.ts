// Help Centre and How It Works content. Everything here describes what the
// platform does today — check the code (and the database rules it cites)
// before changing a claim, and never describe a feature that isn't live.
//
// Facts this copy depends on, and where they're enforced:
//  - Quote requests expire 7 days after they're sent (or on the event date
//    if sooner); the clock restarts when the vendor sends a price
//    (quote_expiry_for / set_quote_request_expiry).
//  - Accepting a quote creates a *pending* booking; only the vendor can
//    confirm it (accept_quote, enforce_bookings_lockdown).
//  - Nobody sets "completed": the vendor marks the job done from the event
//    date and the customer confirms (enforce_job_cards_lockdown).
//  - Contact details in messages are hidden until there's a booking that
//    isn't cancelled (contact-reveal.ts, mask_contact_info).
//  - Online payments are switched off: customers pay vendors directly and
//    Evntly charges no fees (cancellation policy §1, §5, §11; vendor
//    agreement Schedule 1). Payment copy branches on `paymentsEnabled` so it
//    stays true if the admin switch is ever turned on.
//  - Problems can be raised on a booking up to 90 days after the event
//    (open_booking_dispute).
//
// Inline markup: **bold** and [text](/href), rendered by legal's <Inline>.

export type HelpAudience = "customer" | "vendor" | "both";

export type HelpBlock =
  | string
  | { list: string[] }
  | { steps: { title: string; body: string }[] }
  | { note: string }
  | { statuses: { label: string; tone: StatusTone; body: string }[] };

export type StatusTone = "neutral" | "waiting" | "active" | "success" | "ended";

export type HelpTopicId =
  | "getting-started"
  | "quotes"
  | "messaging"
  | "bookings"
  | "payments"
  | "cancellations"
  | "listing"
  | "leads"
  | "account";

export type HelpTopic = { id: HelpTopicId; title: string; description: string };

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  audience: HelpAudience;
  topic: HelpTopicId;
  keywords: string[];
  blocks: HelpBlock[];
  /** Where to do this in the app. */
  action?: { label: string; href: string };
  related?: string[];
};

export type HelpContext = { paymentsEnabled: boolean };

export const HELP_TOPICS: HelpTopic[] = [
  { id: "getting-started", title: "Getting started", description: "What Evntly is and how it works" },
  { id: "quotes", title: "Quotes", description: "Requesting, comparing and accepting quotes" },
  { id: "messaging", title: "Messages", description: "Talking to vendors and customers" },
  { id: "bookings", title: "Bookings", description: "Statuses, confirming and completing" },
  { id: "payments", title: "Payments", description: "How paying for a booking works" },
  { id: "cancellations", title: "Cancellations & problems", description: "Cancelling, refunds and raising a problem" },
  { id: "listing", title: "Your listing", description: "Listing your business on Evntly" },
  { id: "leads", title: "Leads", description: "Requests, smart matches and the Event Feed" },
  { id: "account", title: "Account & safety", description: "Settings, notifications and staying safe" },
];

const POLICY = "[Cancellation, Refund & Dispute Policy](/cancellation-refund-dispute-policy)";

function paymentBlocks(ctx: HelpContext, audience: "customer" | "vendor"): HelpBlock[] {
  const blocks: HelpBlock[] =
    audience === "customer"
      ? [
          "**You pay the vendor directly**, using the payment details and terms they give you. Evntly doesn't take, hold or refund booking payments, and doesn't charge customers any fee.",
          {
            list: [
              "Read the **deposit** and **cancellation terms** on the quote before you accept. If they're missing, ask the vendor in Messages first.",
              "Confirm the vendor's bank details with them by phone before paying, and be wary of any request to change them.",
              "Evntly will never ask you to pay Evntly for a vendor's services.",
              "Your booking's **Invoice** (available once the vendor confirms) records the agreed price.",
            ],
          },
        ]
      : [
          "**Your customer pays you directly**, using the payment details and terms you give them. Evntly doesn't take, hold or release booking payments.",
          {
            list: [
              "Listing on Evntly is currently free: no subscription, no commission and no booking fees.",
              "Put your deposit amount and cancellation terms in every quote — the quote form has fields for both.",
              "Send your payment details in Messages once the customer has accepted your quote, and keep agreements about payment there so there's a record.",
            ],
          },
        ];
  if (ctx.paymentsEnabled) {
    blocks.push({
      note: "Some bookings may show a **Payments** section with an online payment plan. When it's there, follow the steps on the booking page — it explains exactly what is charged and when.",
    });
  }
  return blocks;
}

export function helpArticles(ctx: HelpContext): HelpArticle[] {
  return [
    // ── Getting started ───────────────────────────────────────────────
    {
      slug: "how-evntly-works",
      title: "How Evntly works",
      summary: "Find local vendors, compare quotes and manage bookings in one place.",
      audience: "both",
      topic: "getting-started",
      keywords: ["overview", "about", "what is evntly", "start", "intro"],
      blocks: [
        "Evntly connects people planning events in Sydney with photographers, decorators, DJs, celebrants and other event vendors.",
        {
          steps: [
            { title: "Plan", body: "Tell us about your event, or browse vendors in Explore." },
            { title: "Request quotes", body: "Ask vendors for a price. Each vendor replies with an itemised quote." },
            { title: "Compare and accept", body: "Compare quotes side by side and accept the one you want." },
            { title: "Vendor confirms", body: "The vendor confirms the booking to lock in your date." },
            { title: "Event day", body: "Track the job, then confirm it went as agreed and leave a review." },
          ],
        },
        "Vendors list their business for free, reply to requests with quotes, and manage bookings and availability from their dashboard.",
      ],
      related: ["request-a-quote", "booking-statuses", "create-your-listing"],
    },
    {
      slug: "plan-an-event",
      title: "Plan an event",
      summary: "Use Start Planning to set up your event and see which vendors fit.",
      audience: "customer",
      topic: "getting-started",
      keywords: ["plan", "planning", "event board", "my events", "wizard", "budget", "start planning"],
      action: { label: "Start planning", href: "/plan" },
      blocks: [
        "**Start Planning** asks a few questions — event type, date, guests, budget, location and the services you need. You can fill it in before you have an account; it's saved to **My Events** when you sign up or log in.",
        "Each event gets an **event board** in My Events. It shows which services you still need, the quotes you're waiting on, quotes waiting on you, and vendors that match your event.",
        "You can choose to post the event to the **Event Feed** so vendors can apply with a price. See [Post an event for vendors](/help/articles/event-feed-for-customers).",
        "Event boards also include a budget tracker, and an **Event day** view with a task list.",
      ],
      related: ["find-vendors", "request-a-quote", "event-feed-for-customers"],
    },
    {
      slug: "find-vendors",
      title: "Find vendors",
      summary: "Browse, filter and save vendors in Explore.",
      audience: "customer",
      topic: "getting-started",
      keywords: ["explore", "search", "browse", "filter", "map", "saved", "favourite", "sample"],
      action: { label: "Explore vendors", href: "/explore" },
      blocks: [
        "**Explore** lists approved vendors. Filter by category, price and location, or switch to the map.",
        "Open a vendor to see their photos, packages, prices, reviews and service area. Tap the heart to keep them in **Saved vendors**.",
        { note: "Listings marked **Sample listing** aren't real businesses — they show what a listing looks like and can't be contacted or booked." },
      ],
      related: ["request-a-quote", "plan-an-event"],
    },
    {
      slug: "how-evntly-works-for-vendors",
      title: "How Evntly works for vendors",
      summary: "List for free, reply to leads, and manage bookings from your dashboard.",
      audience: "vendor",
      topic: "getting-started",
      keywords: ["vendor", "business", "overview", "dashboard", "free"],
      action: { label: "Go to your dashboard", href: "/vendor-dashboard" },
      blocks: [
        {
          steps: [
            { title: "Create your listing", body: "Add your business, services, pricing and service area. Evntly reviews new listings, usually within 24–48 hours." },
            { title: "Get leads", body: "Customers request quotes from your listing. You can also find work in Smart matches and the Event Feed." },
            { title: "Send quotes", body: "Reply with an itemised price, deposit and cancellation terms — or decline." },
            { title: "Confirm bookings", body: "When a customer accepts, confirm the booking to lock in the date." },
            { title: "Deliver the job", body: "On the day, mark the job done. The booking completes when the customer confirms." },
          ],
        },
        "Your dashboard has five sections: **Home**, **Leads**, **Listings**, **Bookings** and **Profile**. Messages and notifications are in the header.",
        "Listing on Evntly is currently free: no subscription, no commission and no booking fees.",
      ],
      related: ["create-your-listing", "respond-to-requests", "confirm-bookings"],
    },

    // ── Quotes ───────────────────────────────────────────────────────
    {
      slug: "request-a-quote",
      title: "Request a quote",
      summary: "Ask a vendor for a price for your event.",
      audience: "customer",
      topic: "quotes",
      keywords: ["quote", "request", "price", "enquiry", "ask", "cost"],
      action: { label: "Find a vendor", href: "/explore" },
      blocks: [
        {
          steps: [
            { title: "Open a vendor", body: "From Explore, your saved vendors or your event board." },
            { title: "Tap Request a quote", body: "Add the event date, type, location, guest count and budget. Duration and extra details are optional but help the vendor price accurately." },
            { title: "Send it", body: "The vendor is emailed straight away. Track the request in **Bookings → Requests & quotes**." },
          ],
        },
        {
          list: [
            "The event date has to be from tomorrow onwards.",
            "You can have one open request with each vendor per event.",
            "You need to be signed in to request a quote.",
          ],
        },
      ],
      related: ["quote-statuses", "compare-and-accept-quotes"],
    },
    {
      slug: "quote-statuses",
      title: "What quote statuses mean",
      summary: "Waiting on vendor, Quoted, Accepted, Declined, Cancelled and Expired.",
      audience: "both",
      topic: "quotes",
      keywords: ["status", "pending", "quoted", "accepted", "declined", "expired", "cancelled", "expiry", "deadline", "7 days"],
      action: { label: "Requests & quotes", href: "/dashboard/quotes" },
      blocks: [
        {
          statuses: [
            { label: "Waiting on vendor", tone: "waiting", body: "Sent. The vendor hasn't replied yet." },
            { label: "Quoted — review & accept", tone: "active", body: "The vendor sent a price. It's your turn to accept or decline." },
            { label: "Accepted", tone: "success", body: "You accepted the quote and a booking was created. The vendor now confirms it." },
            { label: "Declined", tone: "ended", body: "The vendor can't take the job. Try another vendor." },
            { label: "Cancelled", tone: "ended", body: "The customer declined the quote." },
            { label: "Expired", tone: "ended", body: "Nobody acted in time. Ask the vendor for a new quote if you still want them." },
          ],
        },
        "**Requests expire.** A request expires 7 days after it's sent, or on the event date if that's sooner. When the vendor sends a price, the customer gets a fresh 7 days (again, no later than the event date) to accept it. Open requests show how long is left.",
      ],
      related: ["compare-and-accept-quotes", "respond-to-requests"],
    },
    {
      slug: "compare-and-accept-quotes",
      title: "Compare and accept quotes",
      summary: "What's in a quote, and what happens when you accept one.",
      audience: "customer",
      topic: "quotes",
      keywords: ["compare", "accept", "decline", "book", "deposit", "inclusions", "travel", "cancellation terms"],
      action: { label: "Requests & quotes", href: "/dashboard/quotes" },
      blocks: [
        "A quote shows the **total price** and can include hours of coverage, travel (already in the total), a **deposit**, what's included, delivery time and the vendor's **cancellation terms**.",
        "If you asked several vendors from an event board, the board lets you compare their quotes side by side.",
        {
          steps: [
            { title: "Accept & book", body: "Creates a booking with the vendor at the quoted price. It starts as **Pending** until the vendor confirms." },
            { title: "Decline", body: "Turns the quote down. The vendor sees the request as cancelled." },
          ],
        },
        { note: "Accepting a quote doesn't take any payment on Evntly. Agree how and when to pay directly with the vendor." },
      ],
      related: ["booking-statuses", "payments-for-customers", "quote-statuses"],
    },
    {
      slug: "event-feed-for-customers",
      title: "Post an event for vendors",
      summary: "Let vendors apply to your event with a price.",
      audience: "customer",
      topic: "quotes",
      keywords: ["event feed", "post", "applications", "apply", "pitch", "vendors apply"],
      action: { label: "Posted to vendors", href: "/dashboard/event-feed" },
      blocks: [
        "When you plan an event you can post it to the **Event Feed**. Approved vendors in the services you need can apply with a price and a short pitch.",
        "See applications in **My Events → Posted to vendors**. **Accept & book** creates a booking at the vendor's price (pending until they confirm) and declines the other applicants for the same service. You can close the listing at any time.",
      ],
      related: ["plan-an-event", "booking-statuses"],
    },
    {
      slug: "respond-to-requests",
      title: "Reply to quote requests",
      summary: "Send an itemised quote or decline, before the request expires.",
      audience: "vendor",
      topic: "leads",
      keywords: ["reply", "respond", "quote", "decline", "new requests", "leads", "price", "deposit", "cancellation terms", "expire"],
      action: { label: "New requests", href: "/vendor-dashboard/enquiries" },
      blocks: [
        "New requests appear in **Leads → New requests**, and you're emailed when one arrives. Each shows the event type, date, location, guests, budget and the customer's notes.",
        {
          steps: [
            { title: "Price it", body: "Enter the total price (AUD). Optionally add hours of coverage, travel (part of the total), a deposit and delivery time." },
            { title: "Describe it", body: "List what's included, add a service description and your cancellation terms." },
            { title: "Send, or decline", body: "The customer is emailed either way. Sent quotes move to **Leads → Quotes**." },
          ],
        },
        "Requests expire 7 days after they arrive (or on the event date if sooner), so reply quickly. Customers often book whoever replies first.",
        { note: "Always include cancellation terms. Customers are asked to read them before accepting, and they're what applies if the booking is cancelled. See the " + POLICY + "." },
      ],
      related: ["quote-statuses", "confirm-bookings", "smart-matches-and-event-feed"],
    },
    {
      slug: "smart-matches-and-event-feed",
      title: "Smart matches and the Event Feed",
      summary: "Two more ways to find work beyond direct requests.",
      audience: "vendor",
      topic: "leads",
      keywords: ["smart matches", "opportunities", "event feed", "apply", "pitch", "matched"],
      action: { label: "Smart matches", href: "/vendor-dashboard/opportunities" },
      blocks: [
        "**Smart matches** are requests from customers who picked you from the vendors Evntly matched to their event, based on your area, prices and availability. Reply to them like any other request.",
        "The **Event Feed** lists events customers have posted. Apply with your price and an optional pitch. If the customer accepts, a booking is created at your price and you're asked to confirm it.",
      ],
      related: ["respond-to-requests", "confirm-bookings"],
    },

    // ── Messaging ────────────────────────────────────────────────────
    {
      slug: "messaging",
      title: "Messaging on Evntly",
      summary: "Who can message whom, attachments, and why contact details are hidden.",
      audience: "both",
      topic: "messaging",
      keywords: ["message", "chat", "conversation", "contact", "phone", "email", "hidden", "attachment", "photo", "pdf", "unread"],
      action: { label: "Open Messages", href: "/messages" },
      blocks: [
        "Messages are in the header (the speech-bubble icon). The badge shows how many are unread.",
        {
          list: [
            "**Customers** can message any approved vendor from their listing, a quote or a booking.",
            "**Vendors** can message a customer once that customer has requested a quote from them or booked them.",
            "You can send photos (JPEG, PNG, WebP, GIF, HEIC) and PDFs.",
          ],
        },
        "**Contact details are hidden until you have a booking together.** Phone numbers, email addresses and social handles in messages show as “[hidden until booking confirmed]” until there's a booking between you that isn't cancelled. Keeping conversations on Evntly means there's a record if something goes wrong.",
        "If someone is making you uncomfortable you can block them from the conversation, or report a vendor from their listing.",
      ],
      related: ["staying-safe", "booking-statuses"],
    },

    // ── Bookings ─────────────────────────────────────────────────────
    {
      slug: "booking-statuses",
      title: "What booking statuses mean",
      summary: "Pending, Confirmed, Completed and Cancelled.",
      audience: "both",
      topic: "bookings",
      keywords: ["booking", "status", "pending", "confirmed", "completed", "cancelled", "waiting", "invoice"],
      blocks: [
        {
          statuses: [
            { label: "Pending", tone: "waiting", body: "The customer accepted a quote. The vendor needs to confirm the booking." },
            { label: "Confirmed", tone: "active", body: "The vendor locked in the date. The job card and invoice are now available." },
            { label: "Completed", tone: "success", body: "The vendor marked the job done and the customer confirmed it. The customer can leave a review." },
            { label: "Cancelled", tone: "ended", body: "Cancelled by the customer or the vendor. The other side is emailed and the date is freed up." },
          ],
        },
        "Customers find bookings in **Bookings → Confirmed bookings**; vendors in **Bookings**. Open a booking for its details, messages, job progress, invoice and problem reporting.",
      ],
      related: ["event-day-and-completion", "cancel-a-booking", "confirm-bookings"],
    },
    {
      slug: "event-day-and-completion",
      title: "Event day and completing a booking",
      summary: "How the job card works, and who completes the booking.",
      audience: "both",
      topic: "bookings",
      keywords: ["job card", "job progress", "on my way", "mark job done", "complete", "completed", "confirm complete", "event day", "review"],
      blocks: [
        "Once a booking is confirmed, it gets a **Job progress** tracker: Scheduled → On the way → Delivered → Confirmed.",
        {
          steps: [
            { title: "Vendor: On my way", body: "Optional — lets the customer know you're heading to the event." },
            { title: "Vendor: Mark job done", body: "Available from the event date onwards." },
            { title: "Customer: Confirm booking complete", body: "Only confirm if the job went as agreed. This completes the booking and can't be undone." },
          ],
        },
        "Nobody can mark a booking completed on their own — it takes both sides. If something went wrong, don't confirm; use **Report a problem** on the booking instead.",
        "After a booking is completed the customer can **leave a review** (one per booking). Reviews come only from completed bookings.",
      ],
      related: ["report-a-problem", "booking-statuses"],
    },
    {
      slug: "confirm-bookings",
      title: "Confirm or cancel a booking (vendors)",
      summary: "Lock in a date after a customer accepts your quote.",
      audience: "vendor",
      topic: "bookings",
      keywords: ["confirm", "booking", "accept", "lock in", "overlap", "double booking", "waiting for you to confirm"],
      action: { label: "Your bookings", href: "/vendor-dashboard/bookings" },
      blocks: [
        "When a customer accepts your quote (or your Event Feed application), you're emailed and the booking appears under **Waiting for you to confirm**.",
        {
          list: [
            "**Confirm booking** locks in the date, tells the customer and opens the job card.",
            "**Cancel booking** frees the date and emails the customer. You'll be asked to confirm first, because it can't be undone.",
            "Evntly won't let you confirm two bookings that overlap. Cancel or move one first.",
          ],
        },
        "Confirmed bookings appear on your calendar, and you can download an invoice from the booking page.",
      ],
      related: ["event-day-and-completion", "calendar-and-availability"],
    },

    // ── Payments ─────────────────────────────────────────────────────
    {
      slug: "payments-for-customers",
      title: "Paying for a booking",
      summary: "You pay the vendor directly. Evntly charges customers nothing.",
      audience: "customer",
      topic: "payments",
      keywords: ["pay", "payment", "deposit", "bank", "invoice", "fee", "card", "money", "refund"],
      blocks: paymentBlocks(ctx, "customer"),
      related: ["compare-and-accept-quotes", "cancel-a-booking", "staying-safe"],
    },
    {
      slug: "payments-for-vendors",
      title: "Getting paid",
      summary: "Customers pay you directly. Listing is free.",
      audience: "vendor",
      topic: "payments",
      keywords: ["paid", "payment", "deposit", "fee", "commission", "invoice", "bank", "payout"],
      blocks: paymentBlocks(ctx, "vendor"),
      related: ["respond-to-requests", "confirm-bookings"],
    },

    // ── Cancellations & problems ─────────────────────────────────────
    {
      slug: "cancel-a-booking",
      title: "Cancel a request or booking",
      summary: "How to cancel, and what happens to deposits and refunds.",
      audience: "both",
      topic: "cancellations",
      keywords: ["cancel", "cancellation", "refund", "deposit", "withdraw", "reschedule", "change date"],
      blocks: [
        "**Quotes:** once a vendor has sent a price, customers can **Decline** it from **Requests & quotes**. Vendors decline a request from the request itself. A request nobody acts on expires on its own.",
        "**Bookings:** open the booking and choose **Cancel booking**. Customers can cancel a pending or confirmed booking; vendors can too. You'll be asked to confirm, the other side is emailed, and it can't be undone.",
        "**Refunds and deposits** depend on the cancellation terms in the vendor's quote and on your rights under the Australian Consumer Law. Because payments are made directly to the vendor, any refund comes from the vendor — Evntly can't reverse or refund payments.",
        "**Rescheduling** needs both of you to agree. Agree it in Messages so there's a record; if a new date doesn't work, the cancellation terms apply.",
        { note: "Read the full " + POLICY + " for what each side must do." },
      ],
      related: ["report-a-problem", "payments-for-customers"],
    },
    {
      slug: "report-a-problem",
      title: "Report a problem with a booking",
      summary: "Raise a no-show, quality, cancellation or payment issue with Evntly.",
      audience: "both",
      topic: "cancellations",
      keywords: ["problem", "dispute", "complaint", "no-show", "quality", "issue", "support", "help", "report"],
      blocks: [
        "Try messaging the other side first — many problems are sorted quickly that way.",
        {
          steps: [
            { title: "Open the booking", body: "Under **Problems with this booking**, choose **Report a problem**. You can do this up to 90 days after the event date." },
            { title: "Tell us what happened", body: "Pick the type (no-show, quality, cancellation, payment, conduct or something else), describe what happened and what would put it right." },
            { title: "Both sides reply", body: "The other party is notified and can respond on the booking. Evntly aims to respond within 3 business days." },
          ],
        },
        "Either side can withdraw the problem once it's sorted. Evntly can help you reach an outcome and record it, and can act on accounts that break the rules — but can't refund payments made directly to a vendor or decide your legal rights.",
        { note: "For outside help, see section 10 of the " + POLICY + "." },
      ],
      related: ["cancel-a-booking", "staying-safe"],
    },

    // ── Listing (vendors) ────────────────────────────────────────────
    {
      slug: "create-your-listing",
      title: "Create your listing",
      summary: "Five quick steps, then a review by Evntly.",
      audience: "vendor",
      topic: "listing",
      keywords: ["listing", "sign up", "join", "approval", "review", "approved", "abn", "business"],
      action: { label: "List your business", href: "/vendor-signup" },
      blocks: [
        {
          steps: [
            { title: "Business", body: "Your business name and details." },
            { title: "Services", body: "The category and services you offer." },
            { title: "Pricing", body: "Your rates." },
            { title: "Locations", body: "Where you work." },
            { title: "Agreement", body: "Accept the Vendor Service Agreement and submit." },
          ],
        },
        "Evntly reviews new listings, usually within 24–48 hours, and emails you when it's approved. You appear in Explore once approved.",
        "Listing on Evntly is currently free.",
      ],
      related: ["manage-your-listing", "how-evntly-works-for-vendors"],
    },
    {
      slug: "manage-your-listing",
      title: "Manage your listing",
      summary: "Edit details, photos and pricing, or pause your listing.",
      audience: "vendor",
      topic: "listing",
      keywords: ["edit", "photos", "videos", "portfolio", "pricing", "packages", "pause", "hide"],
      action: { label: "Your listings", href: "/vendor-dashboard/business" },
      blocks: [
        {
          list: [
            "**Listings** — edit your details, or pause your listing to stop new requests for a while.",
            "**Photos & videos** — upload your portfolio. Good photos make the biggest difference.",
            "**Pricing & packages** — set your rates and packages so customers see what to expect.",
          ],
        },
      ],
      related: ["create-your-listing", "calendar-and-availability"],
    },
    {
      slug: "calendar-and-availability",
      title: "Calendar and availability",
      summary: "Control when you take bookings and sync to your calendar.",
      audience: "vendor",
      topic: "listing",
      keywords: ["calendar", "availability", "days off", "sync", "google calendar", "apple calendar", "ics", "taking bookings"],
      action: { label: "Calendar & availability", href: "/vendor-dashboard/calendar" },
      blocks: [
        {
          list: [
            "**Taking new bookings** — turn this off when you're fully booked.",
            "**Days you never work** — mark regular days off.",
            "**Sync to your calendar** — subscribe from Apple Calendar, Google Calendar or any app that accepts a calendar link. You can reset the link if it's shared by mistake.",
          ],
        },
      ],
      related: ["confirm-bookings", "manage-your-listing"],
    },

    // ── Account & safety ─────────────────────────────────────────────
    {
      slug: "account-and-notifications",
      title: "Account, notifications and security",
      summary: "Choose what you're notified about, turn on two-factor sign-in, or delete your account.",
      audience: "both",
      topic: "account",
      keywords: ["settings", "notifications", "email", "push", "two-factor", "2fa", "security", "password", "delete account", "privacy"],
      action: { label: "Profile & settings", href: "/profile" },
      blocks: [
        {
          list: [
            "**Notifications** — choose email and push alerts for new requests, quote updates, messages and reminders. Booking and payment emails always send.",
            "**Security** — add two-factor authentication with an authenticator app.",
            "**Blocked people** — see and undo blocks.",
            "**Privacy & legal** — the documents you've accepted and your marketing preference.",
            "**Delete account** — permanently remove your account.",
          ],
        },
      ],
      related: ["staying-safe"],
    },
    {
      slug: "staying-safe",
      title: "Staying safe on Evntly",
      summary: "Keep conversations on Evntly and check payment details before you pay.",
      audience: "both",
      topic: "account",
      keywords: ["safe", "safety", "scam", "fraud", "report", "block", "bank details"],
      blocks: [
        {
          list: [
            "Keep messages and agreements on Evntly so there's a record.",
            "Before paying, confirm bank details with the vendor by phone. Be wary of any request to change them.",
            "Evntly will never ask you to pay Evntly for a vendor's services, or for your password.",
            "Report a vendor from their listing, or block someone from a conversation.",
            "If you think you've been scammed, contact your bank straight away and email hello@evntlyapp.com.",
          ],
        },
      ],
      related: ["messaging", "report-a-problem"],
    },
  ];
}

export function helpArticle(slug: string, ctx: HelpContext) {
  return helpArticles(ctx).find((a) => a.slug === slug) ?? null;
}

export function forAudience(articles: HelpArticle[], audience: "customer" | "vendor") {
  return articles.filter((a) => a.audience === audience || a.audience === "both");
}

// ── Guides ────────────────────────────────────────────────────────────
// Each guide is an ordered path through the articles.

export type GuideSection = { title: string; articles: string[] };

export const CUSTOMER_GUIDE: GuideSection[] = [
  { title: "Get started", articles: ["how-evntly-works", "plan-an-event", "find-vendors"] },
  { title: "Get quotes", articles: ["request-a-quote", "quote-statuses", "compare-and-accept-quotes", "event-feed-for-customers"] },
  { title: "Talk to vendors", articles: ["messaging"] },
  { title: "Your bookings", articles: ["booking-statuses", "payments-for-customers", "event-day-and-completion"] },
  { title: "If plans change", articles: ["cancel-a-booking", "report-a-problem"] },
  { title: "Your account", articles: ["account-and-notifications", "staying-safe"] },
];

export const VENDOR_GUIDE: GuideSection[] = [
  { title: "Get started", articles: ["how-evntly-works-for-vendors", "create-your-listing", "manage-your-listing"] },
  { title: "Win work", articles: ["respond-to-requests", "quote-statuses", "smart-matches-and-event-feed"] },
  { title: "Talk to customers", articles: ["messaging"] },
  { title: "Bookings", articles: ["confirm-bookings", "booking-statuses", "event-day-and-completion", "calendar-and-availability"] },
  { title: "Payments", articles: ["payments-for-vendors"] },
  { title: "If plans change", articles: ["cancel-a-booking", "report-a-problem"] },
  { title: "Your account", articles: ["account-and-notifications", "staying-safe"] },
];
