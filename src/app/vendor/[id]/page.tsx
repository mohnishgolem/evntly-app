import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Star, MapPin, ShieldCheck, Clock, Building2, Car, Check, ChevronDown, ChevronRight, MessageCircle } from "lucide-react";
import { getVendorById, getVendorPackages, getVendorPortfolio, getVendorReviews, searchVendors } from "@/lib/data/vendors";
import { formatAud } from "@/lib/payments/money";
import { getCurrentUser } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { categoryLabel, isLaunchCategory, LAUNCH_CITY } from "@/lib/config";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  categoryHeading,
  categoryPath,
  metaDescription,
  pageMetadata,
  parseLocality,
  serviceAreas,
  vendorJsonLd,
} from "@/lib/seo";
import { CategoryArt } from "@/components/category-art";
import { ContactVendor } from "@/components/contact-vendor";
import { BookVendor, type OpenRequest } from "@/components/request-quote";
import { getPaymentsStatus } from "@/lib/payments/server";
import { hasPhoneTabBar, navRole } from "@/lib/nav";
import { SaveVendorButton } from "@/components/save-vendor-button";
import { ShareButton } from "@/components/share-button";
import { ReportVendor } from "@/components/report-vendor";
import { PortfolioGallery } from "@/components/portfolio-gallery";
import { FoundingBadge } from "@/components/founding-badge";
import { SampleBadge } from "@/components/sample-badge";
import { serializeJsonLd } from "@/lib/json-ld";
import { formatAbn } from "@/lib/abn";
import { sampleListingsHidden } from "@/lib/sample-listings";
import { cookies } from "next/headers";
import { BOOK_INTENT_COOKIE } from "@/lib/booking-intent";
import { priceSummary, vendorPrice } from "@/lib/pricing-model";
import { isShareSource, SHARE_SOURCE_COOKIE } from "@/lib/share-profile";
import { WriteReview } from "@/components/write-review";
import { hasReviewedVendor, loadReviewDraft } from "@/lib/data/reviews";
import { isDraftId } from "@/lib/profile-reviews";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vendor = await getVendorById(id);
  // Hidden sample listings 404 for the public; don't leak their name in the title.
  if (!vendor || (vendor.is_demo && sampleListingsHidden())) return {};

  // "Penrith", not "Penrith, NSW 2750" or a bare postcode.
  const city = parseLocality(vendor.city).locality || LAUNCH_CITY;
  const name = vendor.name.trim();
  const title = `${name} — ${categoryLabel(vendor.service_type)} in ${city}`;
  // Bios run to several paragraphs; Google shows about 155 characters.
  const description = metaDescription(
    vendor.bio ||
      `Book ${name}, a ${categoryLabel(vendor.service_type).toLowerCase()} in ${city}${priceSummary(vendor) ? `, ${priceSummary(vendor)}` : ""} on Evntly.`
  );
  return {
    ...pageMetadata({ title, description, path: `/vendor/${id}`, socialTitle: title, type: "profile" }),
    // Sample listings aren't real businesses: keep them out of search.
    ...(vendor.is_demo ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  // The customer pressed "Request a quote" before signing in: the proxy
  // turned ?book=1 into this cookie, so reopen the booking form now they're
  // back (see lib/booking-intent.ts).
  // ?book=1 itself counts too: returning through the email link's
  // "Continue" (/auth/confirm) arrives by a client-side redirect, which never
  // passes through the proxy's cookie swap, so the form didn't reopen (found
  // in PR #82 QA on real Postgres, 20 Nov).
  const sp0 = await searchParams;
  const autoOpenBooking = cookieStore.get(BOOK_INTENT_COOKIE)?.value === "1" || sp0.book === "1";
  // Arrived from the vendor's Share profile link or QR code: the sign-up
  // round trip keeps the tag, so the quote request is still credited even if
  // sign-up finishes in another browser (see lib/share-profile.ts).
  const sp = await searchParams;
  const srcParam = sp.src;
  // ?review=new opens "Write a review"; ?review=<draft id> reopens a guest's
  // saved draft after sign-up (see lib/profile-reviews.ts).
  const reviewParam = Array.isArray(sp.review) ? sp.review[0] : sp.review;
  const shareSource = [Array.isArray(srcParam) ? srcParam[0] : srcParam, cookieStore.get(SHARE_SOURCE_COOKIE)?.value].find(isShareSource) ?? null;
  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  const sameCategory = isLaunchCategory(vendor.service_type) ? vendor.service_type : null;
  const [portfolio, packages, reviews, session, payments, peers] = await Promise.all([
    getVendorPortfolio(id),
    getVendorPackages(id),
    getVendorReviews(id),
    getCurrentUser(),
    getPaymentsStatus(),
    sameCategory && !vendor.is_demo ? searchVendors({ category: sameCategory }) : Promise.resolve([]),
  ]);
  // Other real listings in the same category, for "More DJs in Sydney".
  const related = peers.filter((v) => v.id !== vendor.id && !v.is_demo).slice(0, 4);
  const areas = serviceAreas(vendor.locations_serviced);
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
  const canWriteReview = !vendor.is_demo && !isOwnListing && vendor.status === "approved";
  const [reviewDraft, reviewed] = canWriteReview
    ? await Promise.all([
        loadReviewDraft(reviewParam, vendor.id),
        session ? hasReviewedVendor(vendor.id, session.user.id) : Promise.resolve(false),
      ])
    : [null, false];
  const fromPackage = packages.length ? Math.min(...packages.map((p) => p.price_cents)) : null;
  const price = vendorPrice(vendor);
  // Quote-only vendors with packages show those instead of "Contact for pricing".
  const priceLabel =
    price.amount == null && fromPackage != null ? `Packages from ${formatAud(fromPackage)}` : price.label;

  const jsonLd = vendorJsonLd(vendor, price.amount != null ? price.label : undefined);
  const category = isLaunchCategory(vendor.service_type) ? vendor.service_type : null;
  const breadcrumbs = breadcrumbJsonLd([
    { name: "Evntly", path: "/" },
    ...(category ? [{ name: `${categoryHeading(category)} in ${LAUNCH_CITY}`, path: categoryPath(category) }] : []),
    { name: vendor.name, path: `/vendor/${vendor.id}` },
  ]);

  const name = vendor.name.trim();
  const rated = !!vendor.rating && vendor.rating > 0;
  const deposits = [...new Set(packages.map((p) => p.deposit_percent).filter((d): d is number => !!d))].sort((a, b) => a - b);
  // Highlights and FAQs use only what the vendor has filled in — nothing is
  // inferred or invented, so incomplete listings simply show less.
  const highlights = [
    vendor.verified && { icon: ShieldCheck, text: "Verified business" },
    !!vendor.experience_years && { icon: Clock, text: `${vendor.experience_years} years' experience` },
    vendor.avg_response_hours != null && { icon: MessageCircle, text: `Usually replies within ${Math.max(1, Math.round(vendor.avg_response_hours))} hours` },
    !!vendor.service_radius_km && { icon: Car, text: `Travels up to ${vendor.service_radius_km} km` },
    vendor.abn && { icon: Building2, text: `ABN ${formatAbn(vendor.abn)}${vendor.gst_registered ? " · GST registered" : ""}` },
  ].filter(Boolean) as { icon: typeof Star; text: string }[];
  const faqs = [
    (!!vendor.service_radius_km || !!vendor.free_travel_km) && {
      q: `How far does ${name} travel?`,
      a: [
        vendor.service_radius_km ? `Up to ${vendor.service_radius_km} km from ${vendor.city || LAUNCH_CITY}.` : null,
        vendor.free_travel_km ? `The first ${vendor.free_travel_km} km are included${vendor.travel_fee_cents_per_km ? `, then ${formatAud(vendor.travel_fee_cents_per_km)} per km` : ""}.` : null,
        vendor.travels_regional ? "Also travels to regional areas." : null,
      ].filter(Boolean).join(" "),
    },
    !!vendor.min_booking_hours && { q: "Is there a minimum booking?", a: `Yes, ${vendor.min_booking_hours} hour${vendor.min_booking_hours === 1 ? "" : "s"}.` },
    {
      q: "What about deposits and cancellations?",
      a: `Each quote from ${name} sets out the deposit and cancellation terms before you accept it.${deposits.length ? ` Their packages ask for a ${deposits.length === 1 ? `${deposits[0]}%` : `${deposits[0]}–${deposits[deposits.length - 1]}%`} deposit.` : ""}`,
      link: { href: "/cancellation-refund-dispute-policy", label: "Evntly's Cancellation, Refund & Dispute Policy" },
    },
    !!vendor.languages?.length && { q: "Which languages are spoken?", a: vendor.languages.join(", ") },
  ].filter(Boolean) as { q: string; a: string; link?: { href: string; label: string } }[];
  const sections = [
    portfolio.length > 0 && { id: "photos", label: vendor.is_demo ? "Sample photos" : "Photos" },
    packages.length > 0 && { id: "packages", label: "Packages" },
    { id: "about", label: "About" },
    { id: "reviews", label: "Reviews" },
  ].filter(Boolean) as { id: string; label: string }[];
  const breakdown = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => Math.round(r.rating) === n).length }));

  const saveShare = (
    <div className="flex shrink-0 items-center gap-2">
      <ShareButton
        url={absoluteUrl(`/vendor/${vendor.id}`)}
        title={vendor.name}
        text={`${vendor.name} — ${categoryLabel(vendor.service_type)} on Evntly`}
        className="frost relative size-10 bg-transparent shadow-[var(--shadow-raised-sm)] ring-1 ring-black/5 dark:ring-white/10"
      />
      <SaveVendorButton
        vendorId={vendor.id}
        initialSaved={(session?.profile?.saved_providers ?? []).includes(vendor.id)}
        isAuthenticated={!!session}
        className="frost relative size-10 bg-transparent shadow-[var(--shadow-raised-sm)] ring-1 ring-black/5 dark:ring-white/10"
      />
    </div>
  );

  return (
    <div className="bg-canvas pb-16">
      {!vendor.is_demo && (
        <script
          type="application/ld+json"
          // Vendor name/bio are attacker-controlled — see serializeJsonLd.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd([jsonLd, breadcrumbs]) }}
        />
      )}

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Gallery first: the work sells the vendor. */}
        <div id="photos" className="relative scroll-mt-32 md:pt-6">
          {portfolio.length > 0 ? (
            <PortfolioGallery items={portfolio} vendorName={vendor.name} layout="hero" />
          ) : (
            <div className="-mx-4 flex aspect-[16/9] flex-col items-center justify-center gap-2 [background:var(--gradient-tile)] md:mx-0 md:h-72 md:aspect-auto md:rounded-card md:shadow-[var(--shadow-surface)]">
              <CategoryArt value={vendor.service_type} eager className="size-28 drop-shadow-[0_10px_10px_rgba(28,25,23,0.18)] md:size-36" />
              <p className="text-sm text-muted-foreground">No photos yet</p>
            </div>
          )}
          {/* Phones: save and share sit on the photo, as in native apps. */}
          <div className="absolute top-3 right-0 md:hidden">{saveShare}</div>
        </div>

        <div className="mt-6 grid gap-10 md:mt-8 md:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div className="min-w-0">
            {/* Name, category and the facts people scan for. */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {vendor.founding_vendor && <FoundingBadge />}
                  {vendor.is_demo && <SampleBadge />}
                </div>
                <h1 className="flex items-start gap-2 text-title">
                  <span className="min-w-0 break-words">{vendor.name}</span>
                  {vendor.verified && <ShieldCheck className="mt-1.5 size-6 shrink-0 text-primary" aria-label="Verified" />}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
                  {category ? (
                    // Links each listing to its category page (/sydney/djs) for
                    // browsing and so search engines can follow the hierarchy.
                    <Link href={categoryPath(category)} className="font-medium text-foreground hover:underline">
                      {categoryLabel(vendor.service_type)}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{categoryLabel(vendor.service_type)}</span>
                  )}
                  {rated && (
                    <>
                      <span aria-hidden>·</span>
                      <a href="#reviews" className="flex items-center gap-1 hover:text-foreground">
                        <Star className="size-4 fill-champagne text-champagne" aria-hidden />
                        <span className="font-semibold text-foreground tabular-nums">{vendor.rating!.toFixed(1)}</span>
                        <span className="underline underline-offset-2">
                          {vendor.review_count ?? 0} review{vendor.review_count === 1 ? "" : "s"}
                        </span>
                      </a>
                    </>
                  )}
                  {vendor.city && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="size-4" aria-hidden /> {vendor.city}
                      </span>
                    </>
                  )}
                </p>
                {!vendor.is_demo && (
                  <p className="mt-3">
                    {vendor.available !== false ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success-text">
                        <span className="size-1.5 rounded-full bg-success" aria-hidden /> Taking bookings
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                        Not taking new bookings right now
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="hidden md:block">{saveShare}</div>
            </div>

            {vendor.is_demo && (
              <p className="surface-pressed mt-6 rounded-card px-5 py-4 text-sm text-foreground/75">
                This is a sample listing that shows how vendor profiles work on Evntly. It isn&apos;t a real business, its
                photos are stock images, and it can&apos;t take quote requests.
              </p>
            )}

            {/* Section tabs: sticky under the header, jump links only. */}
            <nav
              aria-label="Profile sections"
              className="frost sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-4 mt-6 border-b border-border/60 px-4 [--frost-bg:color-mix(in_oklab,var(--canvas)_88%,transparent)] [--frost-blur:20px] sm:mx-0 sm:px-0"
            >
              <ul className="scrollbar-hide flex gap-6 overflow-x-auto">
                {sections.map((sec) => (
                  <li key={sec.id}>
                    <a href={`#${sec.id}`} className="block border-b-2 border-transparent py-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:border-border hover:text-foreground">
                      {sec.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {highlights.length > 0 && (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {highlights.map((h) => (
                  <li key={h.text} className="flex items-center gap-3 text-[15px]">
                    <span className="btn-raised flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <h.icon className="size-5 text-foreground/80" strokeWidth={1.75} aria-hidden />
                    </span>
                    {h.text}
                  </li>
                ))}
              </ul>
            )}

            {packages.length > 0 && (
              <section id="packages" aria-labelledby="packages-heading" className="mt-10 scroll-mt-32">
                <h2 id="packages-heading" className="text-headline">Packages</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {packages.map((p) => (
                    <article key={p.id} className="surface-raised flex flex-col rounded-card p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-[17px] leading-snug font-semibold">{p.name}</h3>
                        <span className="shrink-0 text-[17px] font-bold tabular-nums">{formatAud(p.price_cents)}</span>
                      </div>
                      {(p.included_hours || p.extra_hour_cents || p.deposit_percent) && (
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {[
                            p.included_hours ? `${p.included_hours} hrs included` : null,
                            p.extra_hour_cents ? `${formatAud(p.extra_hour_cents)} per extra hour` : null,
                            p.deposit_percent ? `${p.deposit_percent}% deposit` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {p.description && <p className="mt-3 text-sm leading-relaxed text-foreground/90">{p.description}</p>}
                      {p.inclusions.length > 0 && (
                        <ul className="mt-3 space-y-1.5 text-sm">
                          {p.inclusions.map((item) => (
                            <li key={item} className="flex gap-2">
                              <Check className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section id="about" aria-labelledby="about-heading" className="mt-10 scroll-mt-32">
              <h2 id="about-heading" className="text-headline">About {name}</h2>
              {vendor.bio ? (
                <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{vendor.bio}</p>
              ) : (
                <p className="mt-3 text-[15px] text-muted-foreground">{name} hasn&apos;t added a description yet. Ask them anything when you request a quote.</p>
              )}
              {!!vendor.event_types?.length && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Events</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {vendor.event_types.map((et) => (
                      <span key={et} className="btn-raised rounded-full px-3 py-1 text-[13px] font-medium">
                        {et}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {areas.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Areas covered</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{areas.join(" · ")}</p>
                </div>
              )}
              {!!vendor.equipment_list?.length && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold">Equipment</h3>
                  <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                    {vendor.equipment_list.map((item) => (
                      <li key={item} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-foreground/50" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-8">
                <h3 className="text-[17px] font-semibold">Good to know</h3>
                <div className="surface-raised mt-3 divide-y divide-border rounded-card">
                  {faqs.map((f) => (
                    <details key={f.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15px] font-medium">
                        {f.q}
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-standard group-open:rotate-180" aria-hidden />
                      </summary>
                      <p className="pb-4 text-sm leading-relaxed text-muted-foreground">
                        {f.a}
                        {f.link && (
                          <>
                            {" "}
                            <Link href={f.link.href} className="font-medium text-foreground underline underline-offset-2">
                              {f.link.label}
                            </Link>{" "}
                            also applies.
                          </>
                        )}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            </section>

            {portfolio.length > 5 && (
              <section aria-labelledby="portfolio-heading" className="mt-10">
                <h2 id="portfolio-heading" className="text-headline">
                  {vendor.is_demo ? "Sample photos" : "Portfolio"}
                </h2>
                <div className="mt-4">
                  <PortfolioGallery items={portfolio} vendorName={vendor.name} />
                </div>
              </section>
            )}

            <section id="reviews" aria-labelledby="reviews-heading" className="mt-10 scroll-mt-32">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="reviews-heading" className="text-headline">
                  Reviews
                </h2>
                {canWriteReview && (
                  <WriteReview
                    vendorId={vendor.id}
                    vendorName={name}
                    signedIn={!!session}
                    reviewed={reviewed}
                    initialDraft={reviewDraft}
                    draftId={reviewDraft && isDraftId(reviewParam) ? reviewParam : null}
                    autoOpen={reviewParam === "new" || !!reviewDraft}
                    shareSource={shareSource}
                  />
                )}
              </div>
              {reviews.length === 0 ? (
                <div className="surface-pressed mt-4 flex items-center gap-4 rounded-card px-5 py-5">
                  <Star className="size-8 shrink-0 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
                  <p className="text-sm text-foreground/75">
                    No reviews yet.{canWriteReview ? ` Hired ${name} before? Be the first to review them.` : ""}
                  </p>
                </div>
              ) : (
                <>
                  <div className="surface-raised mt-4 grid items-center gap-6 rounded-card p-5 sm:grid-cols-[auto_1fr]">
                    <div className="text-center sm:pr-6">
                      <p className="text-4xl font-bold tabular-nums">{(vendor.rating ?? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1)}</p>
                      <p className="mt-1 flex justify-center gap-0.5" aria-hidden>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star key={i} className={i <= Math.round(vendor.rating ?? 0) ? "size-4 fill-champagne text-champagne" : "size-4 text-border"} />
                        ))}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {reviews.length} review{reviews.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ul className="space-y-1.5" aria-label="Ratings breakdown">
                      {breakdown.map((b) => (
                        <li key={b.n} className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="w-3 tabular-nums">{b.n}</span>
                          <span className="surface-pressed h-1.5 flex-1 overflow-hidden rounded-full">
                            <span className="block h-full rounded-full bg-champagne" style={{ width: `${(b.count / reviews.length) * 100}%` }} />
                          </span>
                          <span className="w-6 text-right tabular-nums">{b.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                    {reviews.map((r) => (
                      <li key={r.id} className="surface-raised rounded-card p-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{r.reviewer_name ?? "Anonymous"}</span>
                          <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                            <Star className="size-3.5 fill-champagne text-champagne" aria-hidden />
                            {r.rating}
                            <span className="sr-only"> out of 5</span>
                          </span>
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {r.event_type && <span>{r.event_type}</span>}
                          {/* Reviews from clients who booked outside Evntly are always labelled. */}
                          <span
                            className={
                              r.source === "past_client"
                                ? "rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
                                : "rounded-full bg-success/10 px-2 py-0.5 text-success-text"
                            }
                          >
                            {r.source === "past_client" ? "Past client · not booked on Evntly" : "Booked on Evntly"}
                          </span>
                        </p>
                        {r.comment && <p className="mt-3 text-sm leading-relaxed text-foreground/90">{r.comment}</p>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {category && related.length > 0 && (
              <section aria-labelledby="related-heading" className="mt-10">
                <h2 id="related-heading" className="text-headline">
                  More {categoryHeading(category)} in {LAUNCH_CITY}
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {related.map((v) => (
                    <li key={v.id}>
                      <Link href={`/vendor/${v.id}`} className="surface-raised lift flex min-h-14 items-center justify-between gap-3 rounded-card px-4 py-3 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">{v.name.trim()}</span>
                          {parseLocality(v.city).locality && (
                            <span className="block truncate text-muted-foreground">{parseLocality(v.city).locality}</span>
                          )}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={categoryPath(category)} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary-text hover:underline">
                  See all {categoryHeading(category)} in {LAUNCH_CITY}
                </Link>
              </section>
            )}

            <div className="mt-10 border-t border-border pt-4">
              <ReportVendor isAuthenticated={!!session} vendorId={vendor.id} />
            </div>
          </div>

          {/* Booking card: sticky beside the content on wider screens. On phones
              BookVendor renders its own bar above the tab bar. */}
          <aside aria-label="Book this vendor">
            <div className="surface-float sticky top-[calc(5.5rem+env(safe-area-inset-top))] rounded-card p-6">
              {price.amount != null ? (
                <p className="text-2xl font-bold tabular-nums">
                  {price.figure}
                  {price.suffix && <span className="text-base font-normal text-muted-foreground"> {price.suffix}</span>}
                </p>
              ) : (
                <p className="text-xl font-bold">{priceLabel}</p>
              )}
              {price.amount != null && fromPackage != null && (
                <p className="mt-0.5 text-sm text-muted-foreground">Packages from {formatAud(fromPackage)}</p>
              )}
              {vendor.is_demo ? (
                <p className="mt-2 mb-5 text-sm text-muted-foreground">Sample listing</p>
              ) : vendor.available !== false ? (
                <p className="mt-2 mb-5 text-sm text-success-text">Taking bookings · check your date when you book</p>
              ) : (
                <p className="mt-2 mb-5 text-sm text-muted-foreground">Not taking new bookings right now</p>
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
                  shareSource={shareSource}
                  priceLabel={priceLabel}
                  paymentsEnabled={payments.enabled}
                  hasTabBar={hasPhoneTabBar(role)}
                />
                {!vendor.is_demo && !isOwnListing && (
                  <ContactVendor isAuthenticated={!!session} vendorId={vendor.id} vendorName={vendor.name} />
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
