import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// App icon: the wordmark's script "E" on the dark brand background with the
// same coral glow as opengraph-image.tsx. Rendered full-bleed — iOS and
// Android apply their own corner rounding / masks.
export const BRAND_BACKGROUND = "#101014";
export const BRAND_THEME_LIGHT = "#ffffff";

export async function brandIcon(size: number, { maskable = false } = {}) {
  const logoFont = await readFile(join(process.cwd(), "src/app/fonts/MagnoliaScript.otf"));
  // Maskable icons get cropped to as little as the centre 80% circle, so the
  // glyph shrinks to stay inside that safe zone.
  const glyphScale = maskable ? 0.54 : 0.72;
  const fontSize = size * glyphScale;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BRAND_BACKGROUND,
          backgroundImage: "radial-gradient(circle at 30% 20%, #e8604a55, transparent 70%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Magnolia Script",
            fontSize,
            lineHeight: 1,
            color: "#ffffff",
            // The script E's ink sits right of and above its em box's
            // centre; pull it back to the optical centre. (Flex centring
            // halves a margin's effect, hence the larger-looking values.)
            marginLeft: -fontSize * 0.064,
            marginTop: fontSize * 0.042,
          }}
        >
          E
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: [{ name: "Magnolia Script", data: logoFont, style: "normal" }],
    }
  );
}
