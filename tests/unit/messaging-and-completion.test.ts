import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Starting conversations and two-party completion, through the REAL
// supabase-js client with only the network faked. The database rules
// (fill_message_recipient, enforce_job_cards_lockdown, ...) were tested
// separately against Postgres; these check what the server actions send and
// how they handle what comes back.
type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];
const respond = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const VENDOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LISTING = "listing-1";
const CONVERSATION = `${LISTING}:${CUSTOMER}`;

let currentUser = VENDOR;
let existingMessages: unknown[] = [];
let messageInsert: { status: number; body: unknown } = { status: 201, body: { id: "m1" } };
let jobCardUpdate: { status: number; body: unknown } = { status: 200, body: [] };

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  calls.push({ url, method, body });
  if (url.includes("/rest/v1/messages") && method === "GET") {
    return respond(url.includes("select=provider_id") ? existingMessages : []);
  }
  if (url.includes("/rest/v1/messages") && method === "POST") return respond(messageInsert.body, messageInsert.status);
  if (url.includes("/rest/v1/job_cards") && method === "PATCH") return respond(jobCardUpdate.body, jobCardUpdate.status);
  if (url.includes("/rpc/my_service_providers")) return respond([]);
  return respond([]);
});

const userClient = createClient("https://example.supabase.co", "anon-test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});
vi.spyOn(userClient.auth, "getUser").mockImplementation(
  async () => ({ data: { user: { id: currentUser, email: `${currentUser}@example.invalid` } }, error: null }) as never
);

const notify = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => userClient }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => null,
  messageRecipientEmail: vi.fn(async () => "recipient@example.invalid"),
  bookingParticipantEmail: vi.fn(async (_id: string, who: string) => `${who}@example.invalid`),
}));
vi.mock("@/lib/email", () => ({
  notify: (...args: unknown[]) => notify(...args),
  formatEventDate: (d: string) => d,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), RATE_LIMIT_ERROR: "Too many attempts." }));
vi.mock("@/lib/payments/server", () => ({ releaseDepositForBooking: vi.fn() }));

const { sendReply } = await import("@/lib/actions/messages");
const { markDelivered, confirmJobDelivery } = await import("@/lib/actions/job-cards");
const { updateBookingStatus } = await import("@/lib/actions/bookings");

const posts = (table: string) => calls.filter((c) => c.method === "POST" && c.url.includes(`/rest/v1/${table}`));
const patches = (table: string) => calls.filter((c) => c.method === "PATCH" && c.url.includes(`/rest/v1/${table}`));

beforeEach(() => {
  calls.length = 0;
  notify.mockClear();
  currentUser = VENDOR;
  existingMessages = [];
  messageInsert = { status: 201, body: { id: "m1" } };
  jobCardUpdate = { status: 200, body: [] };
});

describe("starting a conversation", () => {
  it("lets the vendor send the first message, addressed from the conversation id", async () => {
    expect(await sendReply(CONVERSATION, "Hi, thanks for booking")).toEqual({ success: true });
    const [insert] = posts("messages");
    expect(insert.body).toMatchObject({
      conversation_id: CONVERSATION,
      provider_id: LISTING,
      customer_initiated: false,
      content: "Hi, thanks for booking",
      // Stored unread, or the badge never counts it (read = NULL isn't "not read").
      read: false,
    });
    expect(notify).toHaveBeenCalledOnce();
  });

  it("marks a first message from the customer as customer-initiated", async () => {
    currentUser = CUSTOMER;
    expect(await sendReply(CONVERSATION, "Hello")).toEqual({ success: true });
    expect(posts("messages")[0].body).toMatchObject({ provider_id: LISTING, customer_initiated: true });
  });

  it("keeps who started an existing conversation", async () => {
    existingMessages = [{ provider_id: LISTING, customer_initiated: true }];
    expect(await sendReply(CONVERSATION, "Reply")).toEqual({ success: true });
    expect(posts("messages")[0].body).toMatchObject({ provider_id: LISTING, customer_initiated: true });
  });

  it("refuses a malformed conversation id without writing", async () => {
    expect(await sendReply(`${LISTING}:${CUSTOMER}:extra`, "Hi")).toEqual({ error: "Conversation not found." });
    expect(posts("messages")).toHaveLength(0);
  });

  it("shows the database's refusal instead of claiming success", async () => {
    messageInsert = {
      status: 400,
      body: { code: "P0001", message: "You can message a customer once they've requested a quote or booked you." },
    };
    expect(await sendReply(CONVERSATION, "Cold message")).toEqual({
      error: "You can message a customer once they've requested a quote or booked you.",
    });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("completing a booking", () => {
  it("won't let the vendor complete a booking directly", async () => {
    // Server actions take whatever the browser sends.
    const res = await updateBookingStatus("b1", "complete" as never);
    expect(res).toEqual({ error: "That isn't something you can do to a booking." });
    expect(patches("bookings")).toHaveLength(0);
  });

  it("reports a job card step that matched nothing instead of success", async () => {
    jobCardUpdate = { status: 200, body: [] };
    expect(await markDelivered("jc1")).toEqual({ error: "This job card isn't yours to update." });
    expect(notify).not.toHaveBeenCalled();
  });

  it("passes on the event-day rule from the database", async () => {
    jobCardUpdate = { status: 400, body: { code: "P0001", message: "You can mark the job delivered from the event day." } };
    expect(await markDelivered("jc1")).toEqual({ error: "You can mark the job delivered from the event day." });
  });

  it("asks the customer to confirm once the vendor marks the job done", async () => {
    jobCardUpdate = { status: 200, body: [{ booking_id: "b1", provider_name: "Lens & Light", event_date: "2026-10-27" }] };
    expect(await markDelivered("jc1")).toEqual({ success: true });
    expect(patches("job_cards")[0].url).toContain(`vendor_user_id=eq.${VENDOR}`);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ to: "client_email@example.invalid", cta: { label: "Confirm booking", path: "/bookings/b1" } })
    );
  });

  it("lets only the customer confirm, then tells both sides", async () => {
    currentUser = CUSTOMER;
    jobCardUpdate = { status: 200, body: [{ booking_id: "b1", provider_name: "Lens & Light", event_date: "2026-10-27" }] };
    expect(await confirmJobDelivery("jc1")).toEqual({ success: true });
    expect(patches("job_cards")[0].url).toContain(`organiser_user_id=eq.${CUSTOMER}`);
    expect(patches("job_cards")[0].body).toMatchObject({ status: "confirmed" });
    const recipients = notify.mock.calls.map(([n]) => (n as { to: string }).to);
    expect(recipients).toEqual(["provider_owner_email@example.invalid", "client_email@example.invalid"]);
  });
});
