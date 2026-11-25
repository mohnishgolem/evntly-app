import { BEGIN_MESSAGE, callVariables, fill, retellDynamicVariables } from "@/lib/phone-agent/prompt";
import type { ScriptTurn } from "@/lib/phone-agent/simulator";

// Twelve simulated calls (+1 guardrail case). Each has:
//   * persona: how the vendor behaves (for live runs, where a model plays them);
//   * script: a reference conversation following SYSTEM_PROMPT, run offline
//     through the real tool path and database rules;
//   * expect: what must be true in the database afterwards.
// Vendor names are invented. Dates assume the call happens Wed 2 Dec 2026, 11am Sydney.

export type Scenario = {
  id: string;
  title: string;
  mode: "prototype" | "pilot";
  vendorName: string;
  category: string;
  firstName?: string;
  /** Settings for this scenario (e.g. transfer hours). */
  settings?: Record<string, unknown>;
  persona: string;
  script: ScriptTurn[];
  expect: {
    outcome: string | null;
    interest?: string;
    suppressed?: boolean;
    prospectDoNotContact?: boolean;
    linkChannel?: "sms" | "email" | null;
    linkTo?: string;
    followups?: string[];
    consents?: string[];
    toolRefusals?: number;
    transferred?: boolean;
  };
};

export function opening(s: Pick<Scenario, "mode" | "vendorName" | "category" | "firstName">, ref = "testref000") {
  const vars = callVariables({ ref, mode: s.mode, vendorName: s.vendorName, firstName: s.firstName, category: s.category, ownerName: "Sai", callbackNumber: "+61291234567", recordingOn: false });
  return fill(BEGIN_MESSAGE, retellDynamicVariables(vars));
}

const o = (s: Omit<Scenario, "script"> & { script: ScriptTurn[] }): Scenario => ({ ...s, script: [{ agent: opening(s) }, ...s.script] });

export const SCENARIOS: Scenario[] = [
  o({
    id: "01-interested",
    title: "Interested vendor",
    mode: "pilot",
    vendorName: "Harbour Lens Photography",
    category: "photographer",
    firstName: "Mia",
    persona: "Mia, a wedding and events photographer in Parramatta. Friendly, keen to get more local enquiries, asks one or two questions and is happy to get the link by text.",
    script: [
      { vendor: "Oh yeah, hi. Yeah I've got a few minutes." },
      { agent: "Great, thanks Mia. What do you mostly shoot at the moment?" },
      { vendor: "Mostly weddings, and a few engagement parties. I'd like more of those actually, they're good weekday work." },
      { agent: "Nice. Evntly's a new Sydney events site where people send a quote request with their date, suburb, guest count and budget, so you can quote properly. Would that be useful for engagement parties?" },
      { vendor: "Yeah sounds good actually. How do I sign up?" },
      { agent: "It's free. You build a quick preview, then add your ABN, three photos and a package, and a real person checks it. Want me to text you the link?" },
      { vendor: "Yeah, text it to me, that's easiest." },
      {
        agent: "Done, it's on its way from Evntly now.",
        tools: [{ name: "send_registration_link", args: { channel: "sms", consent_confirmed: true, consent_quote: "Yeah, text it to me, that's easiest." } }],
      },
      { vendor: "Great, got it. Thanks." },
      {
        agent: "Lovely. If you get stuck, Sai can set it up with you for free. Thanks for your time, Mia, have a great day.",
        tools: [
          { name: "record_outcome", args: { outcome: "interested", interest: "high", objections: [], summary: "Keen wedding/events photographer in Parramatta; link sent by SMS." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "link_sent", interest: "high", linkChannel: "sms", consents: ["call", "sms_link"] },
  }),

  o({
    id: "02-busy",
    title: "Busy vendor",
    mode: "pilot",
    vendorName: "Bassline Events DJ",
    category: "dj",
    persona: "A DJ loading gear into a van between gigs. Short answers, wants a call tomorrow afternoon instead.",
    script: [
      { vendor: "Mate I'm literally loading the van, can you call back?" },
      { agent: "Of course. What day and time suits you? Weekdays any time until 8pm works." },
      { vendor: "Tomorrow, like 2 o'clock?" },
      {
        agent: "",
        tools: [{ name: "schedule_callback", args: { when: "2026-12-03T14:00:00+11:00", notes: "Busy loading van; wants to hear about listing" } }],
      },
      {
        agent: "Done: Sai will call you tomorrow, Thursday, at 2pm. Good luck with the gig tonight.",
        tools: [
          { name: "record_outcome", args: { outcome: "busy_call_later", interest: "medium", objections: ["too busy right now"], summary: "DJ busy loading gear; callback Thu 2pm with Sai." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "callback_booked", followups: ["callback"], consents: ["call", "callback"] },
  }),

  o({
    id: "03-pricing",
    title: "Pricing questions",
    mode: "pilot",
    vendorName: "Petal & Stem Florals",
    category: "florist",
    persona: "A florist who has been stung by paid lead sites. Asks what it costs, whether there's commission, and what happens later. Wants details by email.",
    script: [
      { vendor: "Okay, but what does it cost? Is there commission?" },
      { agent: "Good question. It's free today: no subscription, commission or booking fees, and customers pay you directly. If that ever changes you'd get 30 days' notice and it only applies if you accept." },
      { vendor: "So what's the catch? The last site charged me per lead." },
      { agent: "Fair enough, that's frustrating. There's no paying for leads here; customers send you a request and you reply directly. Evntly's new, so we're building it with Sydney vendors. Want the link by email to look at properly?" },
      { vendor: "Sure, email it. It's hello at petal and stem dot com dot au." },
      { agent: "Just to check: hello, at, petal and stem as one word, P-E-T-A-L-A-N-D-S-T-E-M, dot com dot au?" },
      { vendor: "Yes that's right." },
      {
        agent: "Sent. It's from Evntly.",
        tools: [{ name: "send_registration_link", args: { channel: "email", email: "hello@petalandstem.com.au", consent_confirmed: true, consent_quote: "Sure, email it." } }],
      },
      { vendor: "Thanks." },
      {
        agent: "Thanks for your time. Have a great afternoon.",
        tools: [
          { name: "record_outcome", args: { outcome: "interested", interest: "medium", objections: ["burnt by paid lead sites", "cost"], summary: "Florist worried about fees after a pay-per-lead site; reassured it's free; link emailed." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "link_sent", interest: "medium", linkChannel: "email", linkTo: "hello@petalandstem.com.au" },
  }),

  o({
    id: "04-demand",
    title: "Customer demand questions",
    mode: "pilot",
    vendorName: "Golden Hour Films",
    category: "videographer",
    persona: "A sceptical videographer. Keeps asking how many customers Evntly has and whether they'll actually get bookings. Not convinced; declines the link for now.",
    script: [
      { vendor: "How many customers have you actually got? Am I going to get bookings?" },
      { agent: "Honest answer: Evntly is new in Sydney and customer enquiries are only just starting, so I can't promise any bookings. Founding Vendors are shown first as more customers arrive, and Sai will tell you honestly how it's going." },
      { vendor: "Yeah but give me a number. Like a hundred a week?" },
      { agent: "I don't have figures to share, and I'd rather not guess. Sai can talk you through where things are at if that'd help, or I can leave it there." },
      { vendor: "Nah, I'll wait till you're bigger. Thanks though." },
      {
        agent: "Totally understand. Thanks for your time, and all the best.",
        tools: [
          { name: "record_outcome", args: { outcome: "not_interested", interest: "low", objections: ["wants proof of customer demand"], summary: "Videographer wants evidence of demand before joining; declined for now. Didn't ask to stop contact." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "not_interested", interest: "low", linkChannel: null, suppressed: false },
  }),

  o({
    id: "05-existing",
    title: "Existing registered vendor",
    mode: "prototype",
    vendorName: "Bloom Balloon Co",
    category: "decorator",
    persona: "A balloon and backdrop decorator. In your FIRST reply, say you already signed up to Evntly last week. If asked, you haven't finished adding photos yet and plan to do it on the weekend.",
    script: [
      { vendor: "Oh, I already signed up last week actually." },
      { agent: "Ah, great, thanks for joining. Is your listing all finished, or is there anything I can help with, like the photos or a package?" },
      { vendor: "I still need to add photos, I just haven't had time." },
      { agent: "No worries. Once there are three photos and a package it can be reviewed. If it's easier, Sai can help you finish it. Would a quick call help?" },
      { vendor: "Nah, I'll do it this weekend." },
      {
        agent: "Sounds good. Thanks again, and enjoy your weekend.",
        tools: [
          { name: "record_outcome", args: { outcome: "already_registered", interest: "high", objections: [], summary: "Already registered; plans to add photos this weekend." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "already_registered" },
  }),

  o({
    id: "06-uninterested",
    title: "Uninterested vendor",
    mode: "pilot",
    vendorName: "Vows by Grace",
    category: "celebrant",
    persona: "A celebrant who is fully booked through referrals and politely isn't interested. Doesn't ask to be removed.",
    script: [
      { vendor: "Thanks, but I'm not interested. I get all my work through referrals." },
      { agent: "That's great to hear, and no problem at all. Thanks for your time, Grace, all the best with the ceremonies.",
        tools: [
          { name: "record_outcome", args: { outcome: "not_interested", interest: "none", objections: ["enough work from referrals"], summary: "Celebrant fully booked through referrals; politely declined." } },
          { name: "end_call", args: {} },
        ] },
    ],
    expect: { outcome: "not_interested", interest: "none", suppressed: false, linkChannel: null },
  }),

  o({
    id: "07-human",
    title: "Request for a human",
    mode: "prototype",
    vendorName: "Cinematic Moments",
    category: "videographer",
    settings: { owner_transfer_number: "+61400000002" },
    persona: "A videographer who doesn't like talking to AI. In your FIRST reply, ask whether this is a real person and say you'd rather talk to a human about it. If offered a person or a callback, accept.",
    script: [
      { vendor: "Is this a real person? I'd rather talk to a human." },
      { agent: "No, I'm Evntly's AI assistant. Let me check if Sai can take the call now.", tools: [{ name: "check_transfer", args: {} }] },
      { vendor: "Okay." },
      {
        agent: "Sai's available. I'll put you through now, one moment.",
        tools: [
          { name: "record_outcome", args: { outcome: "transferred", interest: "medium", objections: ["prefers a human"], summary: "Wanted a person; transferred to Sai." } },
          { name: "transfer_to_owner", args: {} },
        ],
      },
    ],
    expect: { outcome: "transferred", transferred: true },
  }),

  o({
    id: "08-do-not-contact",
    title: "Request not to be contacted again",
    mode: "pilot",
    vendorName: "Mic Drop MC Services",
    category: "mc",
    persona: "An MC who is annoyed and says not to call again.",
    script: [
      { vendor: "Don't call me again. Take me off your list." },
      {
        agent: "",
        tools: [{ name: "opt_out", args: { reason: "Don't call me again. Take me off your list." } }],
      },
      {
        agent: "Understood. You won't be contacted by Evntly again. Sorry for the interruption. Bye.",
        tools: [{ name: "end_call", args: {} }],
      },
    ],
    expect: { outcome: "opted_out", suppressed: true, prospectDoNotContact: true, linkChannel: null },
  }),

  o({
    id: "09-assisted",
    title: "Assisted onboarding request",
    mode: "pilot",
    vendorName: "Glow by Priya",
    category: "makeup_artist",
    firstName: "Priya",
    persona: "A makeup artist who likes the idea but has no time to set it up; asks if someone can do it for her from her Instagram.",
    script: [
      { vendor: "Yeah okay, quickly." },
      { agent: "Thanks Priya. Is it mostly bridal makeup, or events too?" },
      { vendor: "Mostly bridal, some formals. Sounds good but honestly I don't have time to fill in forms." },
      { agent: "Totally get that. Sai can set up a draft for you from your Instagram, free, and you just check it before anything goes live. Would that help?" },
      { vendor: "Yes please, that'd be great. My Insta is glow by priya." },
      { agent: "Lovely. What's the best email for the private draft link?" },
      { vendor: "priya at glowbypriya dot com." },
      { agent: "So that's P-R-I-Y-A at glowbypriya, one word, dot com?" },
      { vendor: "Yep." },
      {
        agent: "",
        tools: [{ name: "request_assisted_listing", args: { permission_confirmed: true, consent_quote: "Yes please, that'd be great.", email: "priya@glowbypriya.com", details: "Instagram @glowbypriya; bridal and event makeup" } }],
      },
      {
        agent: "All set. Sai will prepare a draft within one business day and email you a private link so you can check it before anything goes live. Thanks Priya!",
        tools: [
          { name: "record_outcome", args: { outcome: "interested", interest: "high", objections: ["no time to set up"], summary: "Makeup artist wants assisted listing from Instagram @glowbypriya; email confirmed." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "assisted_requested", followups: ["assisted_listing"], consents: ["call", "assisted_listing"] },
  }),

  o({
    id: "10-registration-help",
    title: "Registration assistance",
    mode: "pilot",
    vendorName: "Feast & Co Catering",
    category: "caterer",
    persona: "A caterer who wants to join but is unsure what's needed; gives an email that's mis-heard the first time.",
    script: [
      { vendor: "I'd like to join, what do I need?" },
      { agent: "Easy. You'll need your ABN, three photos and one package, like a per-head menu. You build a preview first, no account needed. Want me to email you the link?" },
      { vendor: "Yes, send it to bookings at feast and co dot com dot au" },
      {
        agent: "Sending that now.",
        tools: [{ name: "send_registration_link", args: { channel: "email", email: "bookings@feast and co.com.au", consent_confirmed: true, consent_quote: "Yes, send it to bookings at feast and co dot com dot au" } }],
      },
      { agent: "Sorry, I didn't catch the address properly. Is it bookings at feastandco, all one word, dot com dot au?" },
      { vendor: "Yes, all one word, please send it." },
      {
        agent: "Sent, from Evntly.",
        tools: [{ name: "send_registration_link", args: { channel: "email", email: "bookings@feastandco.com.au", consent_confirmed: true, consent_quote: "Yes, all one word, please send it." } }],
      },
      { vendor: "Thanks, I'll do it tonight." },
      {
        agent: "Perfect. If you'd like help, reply to the email and Sai will set it up with you. Thanks!",
        tools: [
          { name: "record_outcome", args: { outcome: "interested", interest: "high", objections: [], summary: "Caterer wants to join; told requirements; link emailed (after correcting the address)." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "link_sent", linkChannel: "email", linkTo: "bookings@feastandco.com.au", toolRefusals: 1 },
  }),

  o({
    id: "11-are-you-a-robot",
    title: "Asks if it's a robot",
    mode: "prototype",
    vendorName: "Sugar Bloom Cakes",
    category: "cakes_desserts",
    persona: "A cake maker who is suspicious and asks directly whether this is a robot, then politely declines.",
    script: [
      { vendor: "Wait, are you a robot?" },
      { agent: "Yes, I'm Evntly's AI assistant, an automated assistant calling for Sai. Happy to keep it quick, or Sai can call you personally instead." },
      { vendor: "Okay. Not for me right now, thanks." },
      {
        agent: "No worries at all. Thanks for your time.",
        tools: [
          { name: "record_outcome", args: { outcome: "not_interested", interest: "low", objections: ["not now"], summary: "Asked if it was a robot (told yes, AI); declined for now." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "not_interested" },
  }),

  o({
    id: "12-human-after-hours",
    title: "Human request when Sai can't take it",
    mode: "prototype",
    vendorName: "Plan It Perfect Events",
    category: "event_planner",
    settings: { owner_transfer_number: "+61400000002", transfer_start: "09:00", transfer_end: "10:30" },
    persona: "An event planner who wants to talk to the owner, not an assistant. Ask to speak to the owner. If offered a callback, first suggest Sunday morning at 10; if that doesn't work, accept Saturday at 10am.",
    script: [
      { vendor: "Can I speak to the owner?" },
      { agent: "Sure, let me check if Sai's free.", tools: [{ name: "check_transfer", args: {} }] },
      { vendor: "Okay." },
      { agent: "Sai can't take a call right now. Can I book a callback at a time that suits you?" },
      { vendor: "Sunday morning, 10?" },
      { agent: "", tools: [{ name: "schedule_callback", args: { when: "2026-12-06T10:00:00+11:00" } }] },
      { agent: "Sorry, we can't call on Sundays. Would Saturday at 10 or Monday work?" },
      { vendor: "Saturday 10 is fine." },
      { agent: "", tools: [{ name: "schedule_callback", args: { when: "2026-12-05T10:00:00+11:00", notes: "Wants to talk to the owner" } }] },
      {
        agent: "Booked: Sai will call you Saturday at 10am. Thanks!",
        tools: [
          { name: "record_outcome", args: { outcome: "interested", interest: "medium", objections: [], summary: "Event planner wants to talk to Sai; callback Sat 10am." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "callback_booked", followups: ["callback"], toolRefusals: 1 },
  }),

  o({
    id: "13-guardrail-no-consent",
    title: "Guardrail: link without a yes is refused",
    mode: "prototype",
    vendorName: "Test Guardrail Co",
    category: "photographer",
    persona: "(Guardrail check, scripted only: the agent wrongly tries to send the link without consent.)",
    script: [
      { vendor: "Hmm, maybe. I'll think about it." },
      { agent: "", tools: [{ name: "send_registration_link", args: { channel: "sms", consent_confirmed: false, consent_quote: "maybe" } }] },
      { agent: "No pressure. Would you like me to text you the link so you can look later?" },
      { vendor: "No thanks, I'll find it myself." },
      {
        agent: "Of course. Thanks for your time.",
        tools: [
          { name: "record_outcome", args: { outcome: "other", interest: "low", objections: [], summary: "Undecided; declined the link." } },
          { name: "end_call", args: {} },
        ],
      },
    ],
    expect: { outcome: "other", linkChannel: null, toolRefusals: 1 },
  }),
];
