import "server-only";
import { notify } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLAIM_PATH } from "@/lib/founding/sources";

// Founding-vendor emails that aren't invitations (those are in
// invite-email.ts). Kept out of the "use server" actions file so they can't
// be called from the browser.

/** Called by submitVendorListing: the vendor came through the beta, so confirm and tell admins. */
export async function emailApplicationReceived(email: string | null | undefined) {
  notify({
    to: email,
    category: "bookings",
    subject: "We've received your Evntly founding vendor application",
    heading: "Thanks — your application is in",
    lines: [
      "Your listing has been submitted for review. Our team checks every listing before it goes live, and we'll email you as soon as there's a decision on your founding vendor place.",
      "In the meantime you can add photos of your work and set up packages. Complete listings are reviewed faster.",
    ],
    cta: { label: "See your application", path: CLAIM_PATH },
  });
  await emailAdmins("New founding vendor application", `${email ?? "A vendor"} submitted a listing for the founding vendor beta.`);
}

export async function emailAdmins(subject: string, line: string) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: admins } = await admin.from("users").select("email").eq("role", "admin");
  for (const { email } of admins ?? []) {
    notify({
      to: email,
      category: "enquiries",
      subject,
      heading: subject,
      lines: [line],
      cta: { label: "Open Beta Vendors", path: "/admin/beta-vendors" },
    });
  }
}
