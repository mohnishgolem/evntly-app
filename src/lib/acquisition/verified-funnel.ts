// Turns admin_verified_vendor_funnel() rows into the numbers Admin → Beta
// Vendors shows. Genuine vendors only; test/internal accounts are counted
// separately so it's visible that they were left out.

export type VerifiedFunnelRow = {
  is_test: boolean;
  source: string;
  accounts: number;
  verified: number;
  listings_created: number;
  approved: number;
  completed: number;
};

export type VerifiedFunnel = {
  accounts: number;
  verified: number;
  listingsCreated: number;
  approved: number;
  completed: number;
  testExcluded: number;
  bySource: { source: string; verified: number; approved: number; completed: number }[];
};

export function summariseVerifiedFunnel(rows: VerifiedFunnelRow[]): VerifiedFunnel {
  const genuine = rows.filter((r) => !r.is_test);
  const sum = (k: keyof Omit<VerifiedFunnelRow, "is_test" | "source">) => genuine.reduce((n, r) => n + Number(r[k] ?? 0), 0);
  return {
    accounts: sum("accounts"),
    verified: sum("verified"),
    listingsCreated: sum("listings_created"),
    approved: sum("approved"),
    completed: sum("completed"),
    testExcluded: rows.filter((r) => r.is_test).reduce((n, r) => n + Number(r.accounts ?? 0), 0),
    bySource: genuine
      .map((r) => ({ source: r.source, verified: Number(r.verified), approved: Number(r.approved), completed: Number(r.completed) }))
      .sort((a, b) => b.completed - a.completed || b.verified - a.verified || a.source.localeCompare(b.source)),
  };
}

/** Required pace to a goal by a date (Sydney calendar days, inclusive of today). */
export function dailyTarget(current: number, goal: number, today: Date, deadline: Date) {
  const day = 86_400_000;
  const daysLeft = Math.max(1, Math.round((Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate()) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / day) + 1);
  const remaining = Math.max(0, goal - current);
  return { remaining, daysLeft, perDay: Math.ceil(remaining / daysLeft) };
}
