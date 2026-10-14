"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowRight, Store, User, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminVendorActions } from "@/components/admin-vendor-actions";
import { cn } from "@/lib/utils";
import type { LeakLogEntry } from "@/lib/data/admin";

// Categories written by src/lib/payment-guard.ts. phone/email/social come
// from the removed contact-info scanner and are kept only as history.
const CATEGORY_LABEL: Record<string, string> = {
  cash: "Cash",
  payid: "PayID",
  bank_transfer: "Bank transfer",
  crypto: "Crypto",
};
const LEGACY = "legacy";
const categoryKey = (c: string) => (c in CATEGORY_LABEL ? c : LEGACY);
const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? "Contact info (legacy)";

// Three blocked attempts is a pattern, not a slip of the tongue.
const REPEAT_THRESHOLD = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type Sender = {
  email: string;
  count: number;
  lastAt: string;
  vendor: LeakLogEntry["vendor"];
  isVendor: boolean;
};

function senderLabel(e: Pick<LeakLogEntry, "senderIsVendor" | "vendor">) {
  return e.senderIsVendor && e.vendor ? e.vendor.name : "Customer";
}

export function AdminLeakLog({ events }: { events: LeakLogEntry[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [sender, setSender] = useState<string | null>(null);
  // Snapshot "now" once per mount so relative times and the 30-day window
  // agree across a render.
  const [now] = useState(() => Date.now());

  const recent = events.filter((e) => now - new Date(e.created_at).getTime() < 30 * DAY_MS);

  const senders = useMemo(() => {
    const map = new Map<string, Sender>();
    for (const e of events) {
      const key = e.sender_email ?? e.sender_id;
      const s = map.get(key);
      if (s) s.count++;
      else
        map.set(key, {
          email: key,
          count: 1,
          lastAt: e.created_at,
          vendor: e.vendor,
          isVendor: e.senderIsVendor,
        });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [events]);
  const repeat = senders.filter((s) => s.count >= REPEAT_THRESHOLD);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) {
      const k = categoryKey(e.category);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);

  const visible = events.filter(
    (e) =>
      (!category || categoryKey(e.category) === category) &&
      (!sender || (e.sender_email ?? e.sender_id) === sender)
  );

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No blocked attempts yet. Messages that try to arrange cash, PayID, bank transfer or
        crypto payments outside Evntly will show up here.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Messages blocked for trying to take payment outside Evntly. The message was never
        delivered — the sender was asked to edit it.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Stat value={recent.length} label="Blocked, last 30 days" />
        <Stat value={senders.length} label="People involved" />
        <Stat
          value={repeat.length}
          label={`Repeat senders (${REPEAT_THRESHOLD}+)`}
          tone={repeat.length > 0 ? "warning" : undefined}
        />
      </div>

      {repeat.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Repeat senders</h3>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {repeat.map((s) => (
              <div key={s.email} className="flex items-center justify-between gap-4 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSender(s.email)}
                  className="min-w-0 text-left"
                >
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {s.isVendor ? <Store className="size-3.5" /> : <User className="size-3.5" />}
                    {s.isVendor && s.vendor ? s.vendor.name : "Customer"}
                    <span className="font-normal text-muted-foreground">
                      · {s.count} attempts
                    </span>
                  </p>
                  <p suppressHydrationWarning className="truncate text-xs text-muted-foreground">
                    {s.email} · last{" "}
                    {formatDistanceToNowStrict(new Date(s.lastAt), { addSuffix: true })}
                  </p>
                </button>
                {s.isVendor && s.vendor && (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs capitalize text-muted-foreground">
                      {s.vendor.status}
                    </span>
                    <AdminVendorActions
                      vendorId={s.vendor.id}
                      currentStatus={
                        s.vendor.status as "approved" | "rejected" | "suspended" | undefined
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterChip active={!category} onClick={() => setCategory(null)}>
            All {events.length}
          </FilterChip>
          {categories.map(([key, count]) => (
            <FilterChip
              key={key}
              active={category === key}
              onClick={() => setCategory(category === key ? null : key)}
            >
              {key === LEGACY ? "Legacy" : CATEGORY_LABEL[key]} {count}
            </FilterChip>
          ))}
          {sender && (
            <button
              type="button"
              onClick={() => setSender(null)}
              className="flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
            >
              {sender}
              <X className="size-3" />
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing matches these filters.</p>
        ) : (
          <div className="space-y-3">
            {visible.map((e) => (
              <div key={e.id} className="rounded-2xl border border-border p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge
                    variant={categoryKey(e.category) === LEGACY ? "secondary" : "destructive"}
                  >
                    {categoryLabel(e.category)}
                  </Badge>
                  <time
                    suppressHydrationWarning
                    dateTime={e.created_at}
                    title={new Date(e.created_at).toLocaleString()}
                    className="text-xs text-muted-foreground"
                  >
                    {formatDistanceToNowStrict(new Date(e.created_at), { addSuffix: true })}
                  </time>
                </div>
                {e.original_snippet && (
                  <p className="mb-2 text-sm">
                    Matched{" "}
                    <mark className="rounded bg-destructive/10 px-1 py-0.5 font-medium text-destructive">
                      {e.original_snippet}
                    </mark>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setSender(e.sender_email ?? e.sender_id)}
                    className="font-medium text-foreground hover:underline"
                    title={e.sender_email ?? undefined}
                  >
                    {senderLabel(e)}
                  </button>
                  <span className="truncate">({e.sender_email})</span>
                  <ArrowRight className="size-3 shrink-0" />
                  <span className="truncate">
                    {e.senderIsVendor ? "customer" : (e.vendor?.name ?? "vendor")}
                    {e.recipient_email ? ` (${e.recipient_email})` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "warning" }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className={cn("text-2xl font-bold", tone === "warning" && "text-warning")}>{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
