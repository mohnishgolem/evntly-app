import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

let current: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/geocode", () => ({ geocodeSuburb: vi.fn(async () => ({ label: "Bondi", latitude: -33.89, longitude: 151.27 })) }));

const board = await import("@/lib/actions/event-board");

const user = { id: "u1", email: "u1@example.invalid" };
const ownEvent = { id: "e1", event_date: "2099-06-01", suburb: "Bondi", required_services: ["dj"] };
const details = {
  name: "Sam's 30th",
  eventDate: "2099-06-01",
  suburb: "Bondi",
  guestCount: "Under 80" as const,
  budgetTotal: 5000,
  notes: "",
};

describe("event board actions", () => {
  it("refuse logged-out callers without writing", async () => {
    current = fakeSupabase({ user: null });
    expect(await board.setShortlisted("e1", "v1", true)).toEqual({ error: "Event not found." });
    expect(await board.setEventCategories("e1", ["dj"])).toEqual({ error: "Event not found." });
    expect(await board.updateEventDetails("e1", details)).toEqual({ error: "Event not found." });
    expect(await board.deleteEvent("e1")).toEqual({ error: "Event not found." });
    expect(current.writes).toHaveLength(0);
  });

  it("refuse events the caller doesn't own (RLS returns no row)", async () => {
    current = fakeSupabase({ user, results: { events: { data: null } } });
    expect(await board.setShortlisted("someone-elses", "v1", true)).toEqual({ error: "Event not found." });
    expect(await board.deleteEvent("someone-elses")).toEqual({ error: "Event not found." });
    expect(current.writes).toHaveLength(0);
  });

  it("shortlist with only event and vendor ids — the DB fills the rest", async () => {
    current = fakeSupabase({ user, results: { events: { data: ownEvent } } });
    expect(await board.setShortlisted("e1", "v1", true)).toEqual({ success: true });
    expect(current.writes).toEqual([{ table: "event_vendors", op: "upsert", payload: { event_id: "e1", provider_id: "v1" } }]);
  });

  it("reject unknown or hidden categories sent from the browser", async () => {
    current = fakeSupabase({ user, results: { events: { data: ownEvent } } });
    expect(await board.setEventCategories("e1", ["dj", "astronaut"])).toEqual({ error: "Unknown vendor category." });
    expect(await board.setEventCategories("e1", ["venue"])).toEqual({ error: "Unknown vendor category." });
    expect(current.writes).toHaveLength(0);
    expect(await board.setEventCategories("e1", ["dj", "photographer"])).toEqual({ success: true });
  });

  it("validate edits and keep the date in the future", async () => {
    current = fakeSupabase({ user, results: { events: { data: ownEvent } } });
    // @ts-expect-error — tampered guest bucket
    expect((await board.updateEventDetails("e1", { ...details, guestCount: "1000" }))?.error).toBeTruthy();
    expect((await board.updateEventDetails("e1", { ...details, eventDate: "2020-01-01" }))?.error).toMatch(/tomorrow/);
    expect(current.writes).toHaveLength(0);
    expect(await board.updateEventDetails("e1", details)).toEqual({ success: true });
    expect(current.writes[0]).toMatchObject({ table: "events", op: "update", payload: { name: "Sam's 30th" } });
  });
});
