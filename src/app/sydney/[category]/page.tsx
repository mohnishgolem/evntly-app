import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { searchVendors } from "@/lib/data/vendors";
import { getCurrentUser } from "@/lib/data/user";
import { LAUNCH_CITY, type VendorCategory } from "@/lib/config";
import { ExploreResults } from "@/components/explore-results";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  breadcrumbJsonLd,
  categoryFromSlug,
  categoryHeading,
  categoryIntro,
  categoryPages,
  categoryPath,
  pageMetadata,
  vendorItemListJsonLd,
} from "@/lib/seo";

// One landing page per live category (/sydney/photographers, /sydney/djs…):
// a stable, crawlable URL with its own heading and copy, where Explore's
// ?category= filter is a query string search engines treat as a variant.
// Unknown slugs (and hidden categories such as venues) 404.
export const dynamicParams = false;

// generateMetadata and the page both need the list: one query per request.
const vendorsIn = cache((category: VendorCategory) => searchVendors({ category }));

export function generateStaticParams() {
  return categoryPages().map((p) => ({ category: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/sydney/[category]">): Promise<Metadata> {
  const category = categoryFromSlug((await params).category);
  if (!category) return {};
  const heading = categoryHeading(category);
  const vendors = await vendorsIn(category);
  return {
    ...pageMetadata({
      title: `${heading} in ${LAUNCH_CITY}`,
      description: `${categoryIntro(category)} Compare ${heading.toLowerCase()} in ${LAUNCH_CITY} on Evntly and request a quote — no account needed to browse.`,
      path: categoryPath(category),
    }),
    // A page with no listings yet is thin content: keep it out of the index
    // until a vendor in this category is approved.
    ...(vendors.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CategoryLandingPage({ params }: PageProps<"/sydney/[category]">) {
  const { category: slug } = await params;
  // Everything rendered comes from the fixed list of category pages, never
  // from the URL itself.
  const page = categoryPages().find((p) => p.slug === slug);
  if (!page) notFound();

  const { category, heading, path } = page;
  const [vendors, session] = await Promise.all([vendorsIn(category), getCurrentUser()]);
  const others = categoryPages().filter((p) => p.category !== category);
  const breadcrumbs = breadcrumbJsonLd([
    { name: "Evntly", path: "/" },
    { name: `${heading} in ${LAUNCH_CITY}`, path },
  ]);
  const itemList = vendorItemListJsonLd(`${heading} in ${LAUNCH_CITY}`, vendors);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <script
        type="application/ld+json"
        // Vendor names are user-supplied — see serializeJsonLd.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd([breadcrumbs, itemList]) }}
      />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span className="mx-1.5">/</span>
        <Link href="/explore" className="hover:text-foreground">Explore</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{heading}</span>
      </nav>
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">
        {heading} in {LAUNCH_CITY}
      </h1>
      <p className="mb-6 max-w-2xl text-muted-foreground">{categoryIntro(category)}</p>

      {vendors.length > 0 ? (
        <ExploreResults
          vendors={vendors}
          savedVendorIds={session?.profile?.saved_providers ?? []}
          isAuthenticated={!!session}
        />
      ) : (
        <div className="rounded-xl border border-border/60 p-6">
          <p className="font-semibold">No {heading.toLowerCase()} are listed yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href="/plan" className="text-primary hover:underline">
              Tell us about your event
            </Link>{" "}
            and let vendors come to you, or{" "}
            <Link href="/explore" className="text-primary hover:underline">
              browse every vendor
            </Link>
            .
          </p>
        </div>
      )}

      <section className="mt-12">
        <h2 className="mb-3 text-lg font-semibold">More event vendors in {LAUNCH_CITY}</h2>
        <ul className="flex flex-wrap gap-2">
          {others.map((p) => (
            <li key={p.slug}>
              <Link
                href={p.path}
                className="inline-block rounded-full border border-border/60 px-3 py-1.5 text-sm hover:border-primary/40 hover:text-primary"
              >
                {p.heading}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
