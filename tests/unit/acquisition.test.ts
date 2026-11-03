import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { acquisitionMetrics, actionsFor, parseProspectCsv, prospectStage, type ApplicationFacts, type ProspectRecord } from "@/lib/acquisition/pipeline";
import { buildDailyReport } from "@/lib/acquisition/report";

const NOW = new Date("2026-11-10T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const prospect = (over: Partial<ProspectRecord> = {}): ProspectRecord => ({
  id: crypto.randomUUID(),
  business_name: "Test Co",
  category: "DJ",
  suburb: "Parramatta",
  email: null,
  instagram: null,
  phone: null,
  website: null,
  lead_quality: "A",
  consent_basis: "none",
  stage: "discovered",
  contacted_at: null,
  follow_up_count: 0,
  next_follow_up_at: null,
  replied_at: null,
  do_not_contact: false,
  do_not_contact_reason: null,
  created_at: daysAgo(10),
  ...over,
});
const app = (over: Partial<ApplicationFacts>): ApplicationFacts => ({
  email: "x@y.com",
  applicationId: "app",
  applicationStatus: "started",
  onboardingPercent: 20,
  listingStatus: "pending_review",
  decidedAt: null,
  ...over,
});

describe("prospect CSV", () => {
  it("reads the research batch format and only records consent the file states", () => {
    const csv = [
      "business_name,category,location,website,public_email,instagram,phone,source_url,lead_quality,contact_eligibility,outreach_status",
      'Fave Events,DJ / MC,Sydney CBD,faveevents.com.au,FaveEvents@Gmail.com,@faveevents,0421 502 677,https://faveevents.com.au,A,"Email OK (published business address; no refusal notice)",Draft ready',
      "Milk & Honey,Photographer,Leichhardt,milkandhoney.com.au,,@milkandhoney,0412 280 131,https://milkandhoney.com.au/,A,Call or DM only (no published email),Script ready",
      "Email But No Statement,Florist,Penrith,x.com.au,hello@x.com.au,,,https://x.com.au,Z,,",
      ",Florist,Penrith,,,,,,,,",
    ].join("\n");
    const { rows, errors } = parseProspectCsv(csv);
    expect(rows).toHaveLength(3);
    expect(errors).toEqual(["Row 5: no business name."]);
    expect(rows[0]).toMatchObject({ business_name: "Fave Events", email: "faveevents@gmail.com", suburb: "Sydney CBD", consent_basis: "published_business_address", lead_quality: "A" });
    expect(rows[0].consent_note).toContain("https://faveevents.com.au");
    expect(rows[1]).toMatchObject({ email: null, consent_basis: "none", instagram: "@milkandhoney" });
    expect(rows[2]).toMatchObject({ consent_basis: "none", lead_quality: "B" });
  });

  it("accepts an explicit consent_basis but never an unknown one", () => {
    const { rows } = parseProspectCsv("business_name,email,consent_basis\nA,a@a.com,verbal\nB,b@b.com,bought_list");
    expect(rows.map((r) => r.consent_basis)).toEqual(["verbal", "none"]);
  });

  it("refuses files without a business_name column or over 500 rows", () => {
    expect(parseProspectCsv("email\na@a.com").errors[0]).toMatch(/business_name/);
    expect(parseProspectCsv(["business_name", ...Array.from({ length: 501 }, (_, i) => `B${i}`)].join("\n")).errors[0]).toMatch(/500/);
  });
});

describe("pipeline stages", () => {
  it("offers only the next valid steps", () => {
    expect(actionsFor("discovered").map((a) => a.value)).toEqual(["verify", "declined", "do_not_contact"]);
    expect(actionsFor("contacted").map((a) => a.value)).toEqual(["follow_up_sent", "replied", "interested", "declined", "do_not_contact"]);
    expect(actionsFor("registered")).toEqual([]);
  });

  it("moves prospects into the automatic stages once they sign up", () => {
    const p = prospect({ stage: "interested", email: "a@a.com" });
    expect(prospectStage(p, undefined)).toBe("interested");
    expect(prospectStage(p, app({ applicationStatus: "started" }))).toBe("registered");
    expect(prospectStage(p, app({ applicationStatus: "submitted", onboardingPercent: 100 }))).toBe("profile_completed");
    expect(prospectStage(p, app({ applicationStatus: "approved", onboardingPercent: 80 }))).toBe("listing_approved");
    expect(prospectStage(p, app({ applicationStatus: "approved", onboardingPercent: 100, listingStatus: "approved" }))).toBe("active");
    expect(prospectStage(p, app({ applicationStatus: "withdrawn" }))).toBe("interested");
  });

  it("counts the funnel, follow-ups due and a forecast", () => {
    const prospects = [
      prospect({ stage: "verified" }),
      prospect({ stage: "contact_eligible", consent_basis: "verbal" }),
      prospect({ stage: "outreach_approved", consent_basis: "verbal" }),
      prospect({ stage: "contacted", contacted_at: daysAgo(8), next_follow_up_at: daysAgo(1) }), // follow-up due
      prospect({ stage: "contacted", contacted_at: daysAgo(3), next_follow_up_at: daysAgo(-4) }), // not yet
      prospect({ stage: "contacted", contacted_at: daysAgo(9), follow_up_count: 1 }), // already followed up
      prospect({ stage: "interested", contacted_at: daysAgo(5), replied_at: daysAgo(4), email: "jo@decor.com.au" }),
      prospect({ stage: "contacted", contacted_at: daysAgo(9), do_not_contact: true, replied_at: daysAgo(8) }),
    ];
    const applications = [
      app({ email: "JO@decor.com.au", applicationStatus: "approved", onboardingPercent: 100, listingStatus: "approved", decidedAt: daysAgo(2) }),
      app({ email: "waitlist@x.com", applicationStatus: "approved", onboardingPercent: 60, decidedAt: daysAgo(10) }),
      app({ email: "insta@x.com", applicationStatus: "submitted", onboardingPercent: 100 }),
    ];
    const m = acquisitionMetrics(prospects, applications, NOW);
    const funnel = Object.fromEntries(m.funnel.map((f) => [f.stage, f.count]));
    expect(funnel).toMatchObject({ discovered: 7, verified: 7, contact_eligible: 6, outreach_approved: 5, contacted: 4, interested: 1, registered: 3, profile_completed: 2, listing_approved: 2, active: 1 });
    expect(m.prospects.find((p) => p.email === "jo@decor.com.au")?.pipelineStage).toBe("active");
    expect(m.followUpsDue).toHaveLength(1);
    expect(m.kpis).toMatchObject({ awaitingApproval: 1, outreachReady: 1, contacted: 5, responses: 2, doNotContact: 1, approved: 2, active: 1, phase1: 2 });
    expect(m.kpis.prospectConversion).toBe(20);
    expect(m.forecast).toEqual({ approvalsLast28Days: 2, perWeek: 0.5, remaining: 198, weeksToGoal: 396 });
  });

  it("has no forecast without recent approvals", () => {
    expect(acquisitionMetrics([], [], NOW).forecast.weeksToGoal).toBeNull();
  });
});

describe("daily report", () => {
  const stats = {
    approved: 3, goal: 200, incompleteProfiles: 2, delivered: 11, bounced: 0, complained: 0, unsubscribed: 1,
    remindersDue: 2, eligibleToInvite: 7, newFeedback: 0,
  };
  const rows = [
    { submittedAt: daysAgo(0.5), applicationStatus: "submitted", decidedAt: null, email: "secret@vendor.com.au" },
    { submittedAt: daysAgo(3), applicationStatus: "approved", decidedAt: daysAgo(0.2), email: "other@vendor.com.au" },
  ];
  const acq = acquisitionMetrics([prospect({ stage: "contact_eligible", email: "prospect@biz.com.au" })], [], NOW);

  it("summarises progress and what's waiting, with counts only", () => {
    const r = buildDailyReport({ stats, rows } as never, acq, NOW);
    const text = [r.subject, r.heading, ...r.lines].join("\n");
    expect(r.subject).toMatch(/3\/200 approved, 4 to action/);
    expect(text).toContain("1 application waiting for review");
    expect(text).toContain("1 prospect waiting for outreach approval");
    expect(text).toContain("2 waitlist reminders due");
    expect(text).toContain("Last 24 hours: 1 application submitted, 1 approved.");
    expect(text).toContain("Nothing is sent, published or approved automatically.");
    expect(text).not.toMatch(/@/);
  });
});

// The cron route through the REAL supabase-js client, with only the network
// faked, so the test sees exactly which queries and emails go out.
type Call = { url: string; method: string; body: unknown };
const calls: Call[] = [];
const respond = (body: unknown, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let tables: Record<string, unknown> = {};
const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
  if (url.startsWith("https://api.resend.com/emails")) return respond({ id: `re_${calls.length}` });
  if (url.includes("/rpc/founding_vendor_places")) return respond([{ capacity: 200, approved: 0, remaining: 200 }]);
  const table = url.match(/\/rest\/v1\/([a-z_]+)/)?.[1];
  if (method === "GET" && table && table in tables) return respond(tables[table]);
  if (method === "GET") return respond([]);
  return respond(null, 201);
});
const adminClient = createClient("https://example.supabase.co", "service-role-test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fakeFetch as unknown as typeof fetch },
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminClient }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => fn() }));

const { POST } = await import("@/app/api/cron/acquisition-report/route");
const request = (secret?: string) =>
  new Request("https://evntly.test/api/cron/acquisition-report", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  }) as unknown as Parameters<typeof POST>[0];

describe("acquisition report cron route", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal("fetch", fakeFetch);
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Evntly <hello@evntlyapp.com>";
    tables = {
      app_settings: { value: "s3cret" },
      beta_program: { id: 1, capacity: 200 },
      users: [{ email: "Admin@EvntlyApp.com" }, { email: "admin@evntlyapp.com" }],
      vendor_prospects: [],
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejects requests without the shared secret and sends nothing", async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(calls.some((c) => c.url.includes("resend.com"))).toBe(false);
  });

  it("emails admins only, once each, and never touches prospects", async () => {
    const res = await POST(request("s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1 });
    const userQuery = calls.find((c) => c.url.includes("/rest/v1/users"))!;
    expect(userQuery.url).toContain("role=eq.admin");
    expect(userQuery.url).toContain("suspended_at=is.null");
    const emails = calls.filter((c) => c.url.startsWith("https://api.resend.com/emails"));
    expect(emails).toHaveLength(1);
    expect(emails[0].body).toMatchObject({ to: "admin@evntlyapp.com" });
    expect((emails[0].body as { subject: string }).subject).toMatch(/0\/200 approved/);
    // Read-only against the database: no inserts, updates or RPC writes.
    expect(calls.filter((c) => c.url.includes("supabase.co") && c.method !== "GET" && !c.url.includes("/rpc/founding_vendor_places"))).toEqual([]);
  });
});
