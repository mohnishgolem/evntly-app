import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Star, MapPin, ShieldCheck, Clock, Building2 } from "lucide-react";
import { getVendorById, getVendorPackages, getVendorPortfolio, getVendorReviews } from "@/lib/data/vendors";
import { formatAud } from "@/lib/payments/money";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel, LAUNCH_CITY, SITE_URL } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { ContactVendor } from "@/components/contact-vendor";
import { BookVendor, type OpenRequest } from "@/components/request-quote";
import { getPaymentsStatus } from "@/lib/payments/server";
import { navRole } from "@/lib/nav";
import { SaveVendorButton } from "@/components/save-vendor-button";
import { ShareButton } from "@/components/share-button";
import { ReportVendor } from "@/components/report-vendor";
import { PortfolioGallery } from "@/components/portfolio-gallery";
import { FoundingBadge } from "@/components/founding-badge";
import { SampleBadge } from "@/components/sample-badge";
import { serializeJsonLd } from "@/lib/json-ld";
import { formatAbn } from "@/lib/abn";
import { sampleListingsHidden } from "@/lib/sample-listings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vendor = await getVendorById(id);
  // Hidden sample listings 404 for the public; don't leak their name in the title.
  if (!vendor || (vendor.is_demo && sampleListingsHidden())) return {};

  const city = vendor.city || LAUNCH_CITY;
  const title = `${vendor.name} — ${categoryLabel(vendor.service_type)} in ${city}`;
  const description =
    vendor.bio ||
    `Book ${vendor.name}, a ${categoryLabel(vendor.service_type).toLowerCase()} in ${city}, from $${vendor.hourly_rate}/hr on Evntly.`;
  const url = `${SITE_URL}/vendor/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile" },
    // Sample listings aren't real businesses: keep them out of search.
    ...(vendor.is_demo ? { robots: { index: false, follow: false } } : {}),
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ book?: string }>;
}) {
  const { id } = await params;
  // ?book=1: the customer pressed "Book this vendor" before signing in;
  // reopen the booking form now they're back.
  const autoOpenBooking = (await searchParams).book === "1";
  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  const [portfolio, packages, reviews, session, payments] = await Promise.all([
    getVendorPortfolio(id),
    getVendorPackages(id),
    getVendorReviews(id),
    getCurrentUser(),
    getPaymentsStatus(),
  ]);
  // Hidden sample listings stay viewable by admins for internal testing.
  if (vendor.is_demo && sampleListingsHidden() && session?.profile?.role !== "admin") notFound();

  // Auto-tag a quote request to the customer's most recent planned event, so
  // it shows up on that event's board — no picker UI for multiple events yet.
  let latestEventId: string | undefined;
  // Vendors can't book their own listing; a customer who already has an
  // open request here is pointed at it instead of sending a duplicate.
  let isOwnListing = false;
  let openRequest: OpenRequest | null = null;
  if (session?.user.email) {
    const supabase = await createClient();
    const [{ data: latestEvent }, { data: own }, { data: open }] = await Promise.all([
      supabase
        .from("events")
        .select("id")
        .eq("organiser_user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("my_service_providers").select("id").eq("id", id).maybeSingle(),
      supabase
        .rpc("my_quote_requests", { as_role: "client" })
        // RPC results can only be ordered by selected columns.
        .select("id, status, event_date, created_at")
        .eq("vendor_id", id)
        .in("status", ["pending", "quoted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    latestEventId = latestEvent?.id;
    isOwnListing = !!own;
    if (open) openRequest = { id: open.id, status: open.status, eventDate: open.event_date };
  }
  const role = navRole(session?.profile?.role, !!session);
  const fromPackage = packages.length ? Math.min(...packages.map((p) => p.price_cents)) : null;
  const priceLabel = vendor.hourly_rate
    ? `From $${vendor.hourly_rate}/hr`
    : fromPackage != null
      ? `Packages from ${formatAud(fromPackage)}`
      : "Price on request";

  const vendorUrl = `${SITE_URL}/vendor/${vendor.id}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: vendor.name,
    description: vendor.bio ?? undefined,
    image: vendor.avatar_url ?? undefined,
    url: vendorUrl,
    priceRange: vendor.hourly_rate ? `$${vendor.hourly_rate}/hr` : undefined,
    address: vendor.city
      ? { "@type": "PostalAddress", addressLocality: vendor.city, addressCountry: "AU" }
      : undefined,
    ...(vendor.rating && vendor.rating > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: vendor.rating,
            reviewCount: vendor.review_count ?? 0,
          },
        }
      : {}),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {!vendor.is_demo && (
        <script
          type="application/ld+json"
          // Vendor name/bio are attacker-controlled — see serializeJsonLd.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h1 className="text-2xl font-bold">{vendor.name}</h1>
                {vendor.verified && <ShieldCheck className="h-5 w-5 text-primary" />}
              </div>
              {vendor.founding_vendor && <FoundingBadge className="mb-2" />}
              {vendor.is_demo && <SampleBadge className="mb-2" />}
              <p className="text-muted-foreground">{categoryLabel(vendor.service_type)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {!!vendor.rating && vendor.rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-champagne text-champagne" />
                    {vendor.rating.toFixed(1)} ({vendor.review_count ?? 0} reviews)
                  </span>
                )}
                {vendor.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {vendor.city}
                  </span>
                )}
                {!!vendor.experience_years && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" /> {vendor.experience_years} yrs experience
                  </span>
                )}
                {vendor.abn && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" /> ABN {formatAbn(vendor.abn)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ShareButton
                url={vendorUrl}
                title={vendor.name}
                text={`${vendor.name} — ${categoryLabel(vendor.service_type)} on Evntly`}
                size="lg"
                className="border border-border"
              />
              <SaveVendorButton
                vendorId={vendor.id}
                initialSaved={(session?.profile?.saved_providers ?? []).includes(vendor.id)}
                isAuthenticated={!!session}
                size="lg"
                className="border border-border"
              />
            </div>
          </div>

          <ReportVendor
            isAuthenticated={!!session}
            vendorId={vendor.id}
          />

          {vendor.bio && (
            <p className="mt-3 mb-6 leading-relaxed text-foreground/90">{vendor.bio}</p>
          )}

          {!!vendor.event_types?.length && (
            <div className="mb-6 flex flex-wrap gap-2">
              {vendor.event_types.map((et) => (
                <Badge key={et} variant="secondary">
                  {et}
                </Badge>
              ))}
            </div>
          )}

          {vendor.is_demo && (
            <p className="mb-6 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
              This is a sample listing that shows how vendor profiles work on Evntly. It isn&apos;t a
              real business, its photos are stock images, and it can&apos;t take quote requests.
            </p>
          )}
          {packages.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-semibold">Packages</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {packages.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-border p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold">{p.name}</h3>
                      <span className="shrink-0 font-semibold">{formatAud(p.price_cents)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        p.included_hours ? `${p.included_hours} hrs included` : null,
                        p.extra_hour_cents ? `${formatAud(p.extra_hour_cents)} per extra hour` : null,
                        p.deposit_percent ? `${p.deposit_percent}% deposit` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {p.description && <p className="mt-2 text-sm text-foreground/90">{p.description}</p>}
                    {p.inclusions.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                        {p.inclusions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {portfolio.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-semibold">
                {vendor.is_demo ? "Sample photos" : "Portfolio"}
              </h2>
              <PortfolioGallery items={portfolio} vendorName={vendor.name} />
            </section>
          )}

          {(!!vendor.languages?.length || !!vendor.equipment_list?.length) && (
            <section className="mb-8 space-y-3">
              {!!vendor.languages?.length && (
                <p className="text-sm">
                  <span className="font-semibold">Speaks:</span> {vendor.languages.join(", ")}
                </p>
              )}
              {!!vendor.equipment_list?.length && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold">Equipment</h2>
                  <ul className="list-inside list-disc text-sm text-muted-foreground">
                    {vendor.equipment_list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((r) => (
                  <div key={r.id} className="border-b border-border/60 pb-4 last:border-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium">{r.reviewer_name ?? "Anonymous"}</span>
                      <span className="flex items-center gap-0.5 text-sm">
                        <Star className="h-3.5 w-3.5 fill-champagne text-champagne" />
                        {r.rating}
                      </span>
                    </div>
                    {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div>
          <div className="sticky top-[calc(6rem+env(safe-area-inset-top))] rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {vendor.hourly_rate ? (
              <p className="mb-1 text-2xl font-bold">
                ${vendor.hourly_rate}
                <span className="text-base font-normal text-muted-foreground"> / hr</span>
              </p>
            ) : (
              <p className="mb-1 text-xl font-bold">{priceLabel}</p>
            )}
            {vendor.hourly_rate && fromPackage != null && (
              <p className="text-sm text-muted-foreground">Packages from {formatAud(fromPackage)}</p>
            )}
            {vendor.is_demo ? (
              <p className="mb-4 text-sm text-muted-foreground">Sample listing</p>
            ) : vendor.available !== false ? (
              <p className="mb-4 text-sm text-success">Taking bookings · check your date when you book</p>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">Not taking new bookings right now</p>
            )}
            <div className="space-y-2">
              <BookVendor
                isAuthenticated={!!session}
                isOwnListing={isOwnListing}
                isSample={!!vendor.is_demo}
                vendorId={vendor.id}
                vendorName={vendor.name}
                eventId={latestEventId}
                availability={{
                  accepting: vendor.available !== false,
                  unavailableDates: vendor.unavailable_dates ?? [],
                  weeklyDaysOff: vendor.weekly_unavailable_days ?? [],
                }}
                openRequest={openRequest}
                autoOpen={autoOpenBooking}
                priceLabel={priceLabel}
                paymentsEnabled={payments.enabled}
                hasTabBar={role === "customer" || role === "vendor"}
              />
              {!vendor.is_demo && !isOwnListing && (
                <ContactVendor
                  isAuthenticated={!!session}
                  vendorId={vendor.id}
                  vendorName={vendor.name}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
