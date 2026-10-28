import type { Metadata } from "next";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { BookingReturnNote } from "@/components/auth/booking-return-note";
import { isBookingReturn, safeNextPath } from "@/lib/safe-redirect";

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

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="mb-1 text-2xl font-bold">{booking ? "Create your account to book" : "Join Evntly"}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {booking
          ? "It takes a minute and it's free."
          : "Create your account to plan an event or list your business."}
      </p>
      {booking && <BookingReturnNote />}
      <AuthTabs defaultTab="signup" defaultRole={role === "vendor" && !booking ? "vendor" : "customer"} next={next} />
    </div>
  );
}
