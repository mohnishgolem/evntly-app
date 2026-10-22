// Labels for admin_risk_overview signals (kept beside the SQL weights:
// contact attempt 3, reported 4, blocked 2, quick cancel 3, dispute 4,
// request burst 5, shared ABN 6; high ≥ 12, medium ≥ 5).

export const RISK_SIGNALS: Record<string, { label: string; explain: string }> = {
  contact_attempt: { label: "Contact-detail attempts", explain: "Tried to share a phone, email or handle before booking" },
  reported: { label: "Reported", explain: "Another user reported them" },
  blocked: { label: "Blocked", explain: "Another user blocked them" },
  quick_cancel: { label: "Quick cancellations", explain: "A booking from an accepted quote was cancelled within 72 hours" },
  dispute_against: { label: "Disputes against", explain: "The other party raised a dispute on a booking" },
  request_burst: { label: "Request bursts", explain: "15+ quote requests in one day" },
  shared_abn: { label: "Shared ABN", explain: "Their ABN is also on another owner's listing" },
};

export type RiskAccount = {
  user_id: string;
  email: string | null;
  role: string | null;
  score: number;
  level: "high" | "medium" | "low";
  latest_at: string;
  counts: Record<string, number>;
  evidence: { kind: string; at: string; detail: string | null }[];
  listings: { id: string; name: string; status: string }[];
  reviewed_at: string | null;
  review_note: string | null;
  reviewed: boolean;
};

export const signalLabel = (kind: string) => RISK_SIGNALS[kind]?.label ?? kind;
