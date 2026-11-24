import { headers } from "next/headers";
import { isInAppBrowser } from "@/lib/in-app-browser";
import type { Metadata } from "next";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { BookingReturnNote, ReviewReturnNote } from "@/components/auth/booking-return-note";
import { isReviewReturn } from "@/lib/profile-reviews";
import { isBookingReturn, safeNextPath } from "@/lib/safe-redirect";
import { isFoundingPath } from "@/lib/founding/sources";
import { FunnelPing } from "@/components/founding/funnel-ping";
import { FEE_SUMMARY, PHOTO_RULE } from "@/lib/vendor-terms";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create an Evntly account to plan an event or list your business.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const { role, next: rawNext } = await searchParams;
  const next = rawNext ? safeNextPath(rawNext) : undefined;
  const booking = isBookingReturn(next);
  const review = isReviewReturn(next);
  const founding = role === "vendor" && isFoundingPath(next);

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">
        {booking ? "Create your account to book" : review ? "Create your account to post your review" : founding ? "Claim your free listing" : "Join Evntly"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {booking || review
          ? "It takes a minute and it's free."
          : founding
            ? "Step 1 of 2: create your free account. Next you'll set up your listing."
            : "Create your account to plan an event or list your business."}
      </p>
      {booking && <BookingReturnNote />}
      {review && <ReviewReturnNote />}
      {founding && <FunnelPing event="signup_view" />}
      <AuthTabs
        defaultTab="signup"
        defaultRole={role === "vendor" && !booking ? "vendor" : "customer"}
        next={next}
        inAppBrowser={isInAppBrowser((await headers()).get("user-agent"))}
      />
      {founding && (
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          For your listing you&apos;ll need your business name, ABN, the Sydney areas you cover and a starting rate.{" "}
          {PHOTO_RULE} {FEE_SUMMARY}
        </p>
      )}
    </div>
  );
}
