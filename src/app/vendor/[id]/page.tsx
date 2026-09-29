import { notFound } from "next/navigation";
import { Star, MapPin, ShieldCheck, Clock } from "lucide-react";
import { getVendorById, getVendorPortfolio, getVendorReviews } from "@/lib/data/vendors";
import { getCurrentUser } from "@/lib/data/user";
import { categoryLabel } from "@/lib/config";
import { Badge } from "@/components/ui/badge";
import { ContactVendor } from "@/components/contact-vendor";
import { RequestQuote } from "@/components/request-quote";

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h1 className="text-2xl font-bold">{vendor.name}</h1>
                {vendor.verified && <ShieldCheck className="h-5 w-5 text-blue-500" />}
              </div>
              <p className="text-muted-foreground">{categoryLabel(vendor.service_type)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {!!vendor.rating && vendor.rating > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-foreground text-foreground" />
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
          </div>

          {vendor.bio && <p className="mb-6 leading-relaxed text-foreground/90">{vendor.bio}</p>}

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
                        <Star className="h-3.5 w-3.5 fill-foreground text-foreground" />
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
          <div className="sticky top-24 rounded-2xl border border-border p-5">
            <p className="mb-1 text-2xl font-bold">
              ${vendor.hourly_rate}
              <span className="text-base font-normal text-muted-foreground"> / hr</span>
            </p>
            {vendor.available ? (
              <p className="mb-4 text-sm text-green-600">Available for bookings</p>
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
