import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getVendorById } from "@/lib/data/vendors";
import { categoryLabel } from "@/lib/config";
import { listingCoverUrl } from "@/lib/portfolio-media";
import { sampleListingsHidden } from "@/lib/sample-listings";
import { shareServiceArea } from "@/lib/share-profile";

// Link preview for a vendor profile (iMessage, WhatsApp, Instagram DMs,
// Facebook): the vendor's cover photo — the same one their listing card and
// Share profile default to — beside their name, category and area.

export const alt = "Event vendor profile on Evntly";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CORAL = "#e8604a";

/** The cover photo as a data URL, or null (missing, slow, or not JPEG/PNG). */
async function coverDataUrl(url: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vendor, logoFont, textFont] = await Promise.all([
    getVendorById(id).catch(() => null),
    readFile(join(process.cwd(), "src/app/fonts/MagnoliaScript.otf")),
    readFile(join(process.cwd(), "src/app/fonts/Inter-Regular.woff")),
  ]);
  // Hidden sample listings 404 for the public; don't show their name here either.
  const show = vendor && !(vendor.is_demo && sampleListingsHidden());
  const photo = show ? await coverDataUrl(listingCoverUrl(vendor, 1200)) : null;
  // Passing fonts replaces next/og's default, so the text face is listed too.
  const fonts = [
    { name: "Inter", data: textFont, style: "normal" as const, weight: 400 as const },
    { name: "Magnolia", data: logoFont, style: "normal" as const, weight: 400 as const },
  ];

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#fff", fontFamily: "Inter" }}>
        <div style={{ display: "flex", width: 630, height: 630, background: CORAL, alignItems: "center", justifyContent: "center" }}>
          {photo ? (
            <img src={photo} width={630} height={630} style={{ objectFit: "cover" }} alt="" />
          ) : (
            <span style={{ fontFamily: "Magnolia", fontSize: 150, color: "rgba(255,255,255,0.9)" }}>Evntly</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "0 56px", borderLeft: `10px solid ${CORAL}` }}>
          {show ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 26, color: CORAL, letterSpacing: 2, textTransform: "uppercase", fontWeight: 400 }}>{categoryLabel(vendor.service_type)}</span>
              <span style={{ fontSize: vendor.name.length > 22 ? 52 : 64, color: "#1d1d1f", lineHeight: 1.08, marginTop: 14 }}>
                {vendor.name.length > 48 ? `${vendor.name.slice(0, 47)}…` : vendor.name}
              </span>
              <span style={{ fontSize: 30, color: "#5f5f66", marginTop: 18 }}>{shareServiceArea(vendor)}</span>
              <span style={{ fontSize: 26, color: "#1d1d1f", marginTop: 44 }}>View profile & request a quote</span>
            </div>
          ) : (
            <span style={{ fontSize: 44, color: "#1d1d1f" }}>Book event vendors in Sydney</span>
          )}
          <span style={{ fontFamily: "Magnolia", fontSize: 64, color: CORAL, marginTop: 28 }}>Evntly</span>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
