import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LAUNCH_CITY } from "@/lib/config";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const [logoFont, subtitleFont] = await Promise.all([
    readFile(join(process.cwd(), "src/app/fonts/MagnoliaScript.otf")),
    readFile(join(process.cwd(), "src/app/fonts/Inter-Regular.woff")),
  ]);
  const subtitle = `FIND TRUSTED EVENT VENDORS IN ${LAUNCH_CITY.toUpperCase()}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#101014",
          backgroundImage: "radial-gradient(circle at 25% 15%, #e8604a22, transparent 60%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Magnolia Script",
            fontSize: 180,
            color: "#ffffff",
          }}
        >
          Evntly
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Inter",
            fontSize: 32,
            color: "#a5a7b2",
            marginTop: 8,
            letterSpacing: 2,
          }}
        >
          {subtitle}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Magnolia Script", data: logoFont, style: "normal" },
        { name: "Inter", data: subtitleFont, style: "normal", weight: 400 },
      ],
    }
  );
}
