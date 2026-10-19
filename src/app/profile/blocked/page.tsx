import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { UnblockButton } from "@/components/block-user";

export const metadata: Metadata = {
  title: "Blocked people",
  robots: { index: false, follow: false },
};

export default async function BlockedPeoplePage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/profile/blocked");

  const supabase = await createClient();
  // Labels only — a vendor's business name or a "Jane D." short name, never
  // the blocked person's email (see my_blocks).
  const { data: blocks } = await supabase.rpc("my_blocks");

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/profile"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Profile
      </Link>
      <h1 className="mb-1 text-[28px] font-bold tracking-tight">Blocked people</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        People you&apos;ve blocked can&apos;t message you, request quotes, or apply to your
        events. You can block someone from a message thread or a quote request.
      </p>

      {!blocks || blocks.length === 0 ? (
        <p className="rounded-2xl bg-secondary px-4 py-8 text-center text-sm text-muted-foreground">
          You haven&apos;t blocked anyone.
        </p>
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-secondary">
          {blocks.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-[15px]">{b.label}</p>
                <p className="text-xs text-muted-foreground">
                  Blocked {new Date(b.created_at).toLocaleDateString("en-AU")}
                </p>
              </div>
              <UnblockButton blockId={b.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
