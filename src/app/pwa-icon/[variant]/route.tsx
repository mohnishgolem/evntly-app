import { notFound } from "next/navigation";
import { brandIcon } from "@/lib/brand-icon";

// Install icons referenced by app/manifest.ts. A route handler (rather than
// the icon.tsx convention) keeps the URLs stable for the manifest.
const VARIANTS = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  maskable: { size: 512, maskable: true },
} as const;

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ variant: string }> }
) {
  const { variant } = await params;
  const config = VARIANTS[variant as keyof typeof VARIANTS];
  if (!config) notFound();
  return brandIcon(config.size, { maskable: config.maskable });
}
