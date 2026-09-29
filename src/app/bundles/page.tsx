import Link from "next/link";
import { Layers } from "lucide-react";
import { getActiveBundles } from "@/lib/data/bundles";

export default async function BundlesPage() {
  const bundles = await getActiveBundles();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Vendor bundles</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Multiple vendors teamed up into one discounted package — no account needed to browse.
      </p>

      {bundles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Layers className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No bundles published yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {bundles.map((b) => {
            const price = (b.total_price ?? 0) - (b.bundle_discount_amount ?? 0);
            return (
              <Link
                key={b.id}
                href={`/bundles/${b.id}`}
                className="block rounded-2xl border border-border p-5 transition-colors hover:border-primary/40"
              >
                <p className="font-semibold">{b.name}</p>
                {b.category && <p className="text-sm text-muted-foreground">{b.category}</p>}
                {b.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{b.description}</p>
                )}
                <p className="mt-3 text-lg font-bold">
                  ${price}
                  {!!b.bundle_discount_amount && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground line-through">
                      ${b.total_price}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {b.participant_emails?.length ?? 1} vendors included
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
