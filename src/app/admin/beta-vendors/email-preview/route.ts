import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/data/user";
import { renderInviteEmail } from "@/lib/founding/invite-email";

// The invitation exactly as recipients see it, with a preview link that
// claims nothing. Admins only. ?format=text shows the plain-text part.
export async function GET(request: Request) {
  const { admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return new NextResponse("Not authorized", { status: 403 });
  const email = renderInviteEmail({
    firstName: "Alex",
    token: null,
    unsubscribeToken: null,
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
  });
  const text = new URL(request.url).searchParams.get("format") === "text";
  return new NextResponse(text ? `Subject: ${email.subject}\n\n${email.text}` : email.html, {
    headers: {
      "Content-Type": text ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
