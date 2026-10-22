import { vi } from "vitest";

// Minimal chainable stand-in for the Supabase client used by server actions.
// `results` maps "table" or "rpc:name" to what the terminal call resolves to.
export function fakeSupabase(opts: {
  user?: { id: string; email: string; user_metadata?: Record<string, unknown> } | null;
  aal?: "aal1" | "aal2";
  nextAal?: "aal1" | "aal2";
  results?: Record<string, { data: unknown; error?: unknown }>;
}) {
  const writes: { table: string; op: string; payload?: unknown }[] = [];
  const result = (key: string) => opts.results?.[key] ?? { data: null, error: null };

  // A "table:op" key (e.g. "quote_requests:insert") overrides "table" for
  // calls that wrote, so a read and an insert on one table can differ.
  const builder = (key: string, table: string) => {
    const b: Record<string, unknown> = {};
    let op: string | null = null;
    const res = () => (op && opts.results?.[`${key}:${op}`]) || result(key);
    const chain = () => b;
    for (const m of ["select", "eq", "neq", "in", "gte", "gt", "lte", "is", "order", "limit"]) b[m] = vi.fn(chain);
    for (const o of ["insert", "update", "delete", "upsert"]) {
      b[o] = vi.fn((payload?: unknown) => {
        op = o;
        writes.push({ table, op: o, payload });
        return b;
      });
    }
    b.maybeSingle = vi.fn(async () => res());
    b.single = vi.fn(async () => res());
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(res()).then(resolve);
    return b;
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: opts.user ?? null } })),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: { currentLevel: opts.aal ?? "aal1", nextLevel: opts.nextAal ?? opts.aal ?? "aal1" },
        })),
      },
    },
    from: vi.fn((table: string) => builder(table, table)),
    rpc: vi.fn((name: string) => builder(`rpc:${name}`, `rpc:${name}`)),
    storage: { from: vi.fn() },
  };
  return { client, writes };
}
