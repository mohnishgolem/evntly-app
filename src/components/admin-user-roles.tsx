"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserRole } from "@/lib/actions/admin";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

const ROLES = ["customer", "vendor", "admin"] as const;

export function AdminUserRoles({ users }: { users: UserRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = users.filter((u) => u.email.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search users…"
        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-ring"
      />
      <div className="divide-y divide-border rounded-2xl border border-border">
        {filtered.map((u) => (
          <UserRoleRow key={u.id} user={u} />
        ))}
      </div>
    </div>
  );
}

function UserRoleRow({ user }: { user: UserRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const role = user.role ?? "customer";

  function setRole(next: (typeof ROLES)[number]) {
    if (next === role) return;
    startTransition(async () => {
      await setUserRole(user.id, next);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.email}</p>
      </div>
      <div className="flex gap-1.5">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            disabled={pending}
            onClick={() => setRole(r)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-50",
              role === r
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/40"
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
