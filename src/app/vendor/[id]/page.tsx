import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Star, MapPin, ShieldCheck, Clock } from "lucide-react";
import { getVendorById, getVendorPortfolio, getVendorReviews } from "@/lib/data/vendors";
import { getCurrentUser } from "@/lib/data/user";
import { categoryLabel, LAUNCH_CITY, SITE_URL } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { ContactVendor } from "@/components/contact-vendor";
import { RequestQuote } from "@/components/request-quote";
import { SaveVendorButton } from "@/components/save-vendor-button";
import { ShareButton } from "@/components/share-button";
import { ReportVendor } from "@/components/report-vendor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vendor = await getVendorById(id);
  if (!vendor) return {};

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
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  const [portfolio, reviews, session] = await Promise.all([
    getVendorPortfolio(id),
    getVendorReviews(id),
    getCurrentUser(),
  ]);

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h1 className="text-2xl font-bold">{vendor.name}</h1>
                {vendor.verified && <ShieldCheck className="h-5 w-5 text-primary" />}
              </div>
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
            vendorEmail={vendor.owner_email}
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

          {portfolio.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-lg font-semibold">Portfolio</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {portfolio.map((item) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={item.id}
                    src={item.thumbnail_url ?? item.media_url}
                    alt={item.caption ?? vendor.name}
                    className="aspect-square rounded-xl object-cover"
                  />
                ))}
              </div>
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
          <div className="sticky top-24 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="mb-1 text-2xl font-bold">
              ${vendor.hourly_rate}
              <span className="text-base font-normal text-muted-foreground"> / hr</span>
            </p>
            {vendor.available ? (
              <p className="mb-4 text-sm text-success">Available for bookings</p>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">Currently unavailable</p>
            )}
            <div className="space-y-2">
              <ContactVendor
                isAuthenticated={!!session}
                vendorId={vendor.id}
                vendorOwnerEmail={vendor.owner_email}
                vendorName={vendor.name}
              />
              <RequestQuote
                isAuthenticated={!!session}
                vendorId={vendor.id}
                vendorEmail={vendor.owner_email}
                vendorName={vendor.name}
                serviceType={vendor.service_type}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
