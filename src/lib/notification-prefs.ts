// What a person can switch off, and how a stored preference is read.
// Pure, so the rules (including the ones that can't be switched off) are
// unit-tested and shared by notify(), the settings page and its action.

export const NOTIFICATION_CATEGORIES = [
  {
    key: "enquiries",
    label: "New requests",
    vendor: "Quote requests, including customers who picked you from their matches",
    customer: "Vendors applying to events you posted",
  },
  {
    key: "quotes",
    label: "Quote updates",
    vendor: "A customer accepted your quote, or a job you applied for went elsewhere",
    customer: "Vendors sending you a quote or declining a request",
  },
  {
    key: "bookings",
    label: "Bookings & payments",
    vendor: "Confirmations, cancellations and payments",
    customer: "Confirmations, cancellations and payments",
  },
  {
    key: "messages",
    label: "Messages",
    vendor: "New messages from customers",
    customer: "New messages from vendors",
  },
  {
    key: "reminders",
    label: "Reminders",
    vendor: "Nudges before a request or quote expires",
    customer: "Nudges before a quote expires, and suggestions when a vendor doesn't reply",
  },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["key"];
export type NotificationChannel = "email" | "push";
export type NotificationPrefs = Record<NotificationChannel, Record<NotificationCategory, boolean>>;

export const CATEGORY_KEYS = NOTIFICATION_CATEGORIES.map((c) => c.key) as NotificationCategory[];
const CHANNELS: NotificationChannel[] = ["email", "push"];

/**
 * Booking and payment emails are the record of a commitment and its money
 * (confirmations, cancellations, refunds) — they always send. Push for them
 * can still be turned off.
 */
export function isLocked(category: NotificationCategory, channel: NotificationChannel) {
  return category === "bookings" && channel === "email";
}

/** Stored JSON → full preferences. Anything missing or malformed means "on". */
export function normalisePrefs(raw: unknown): NotificationPrefs {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as NotificationPrefs;
  for (const ch of CHANNELS) {
    const row = src[ch] && typeof src[ch] === "object" ? (src[ch] as Record<string, unknown>) : {};
    out[ch] = {} as Record<NotificationCategory, boolean>;
    for (const cat of CATEGORY_KEYS) out[ch][cat] = isLocked(cat, ch) ? true : row[cat] !== false;
  }
  return out;
}

export function isAllowed(prefs: NotificationPrefs, category: NotificationCategory, channel: NotificationChannel) {
  return isLocked(category, channel) || prefs[channel][category] !== false;
}
