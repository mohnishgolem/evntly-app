import { categoryArt } from "@/lib/category-art";
import { categoryIcon } from "@/lib/config";
import { cn } from "@/lib/utils";

// A category's 3D illustration, or its line icon if it has none. Decorative:
// the visible label next to it names the category.
export function CategoryArt({ value, className, eager = false }: { value: string; className?: string; eager?: boolean }) {
  const src = categoryArt(value);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny static WebP; next/image adds nothing here
    return <img src={src} alt="" aria-hidden width={96} height={96} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} className={cn("object-contain select-none", className)} />;
  }
  const Icon = categoryIcon(value);
  // eslint-disable-next-line react-hooks/static-components -- categoryIcon returns a stateless lucide icon, not a dynamically-defined component
  return <Icon aria-hidden className={cn("p-[18%] text-foreground/70", className)} strokeWidth={1.5} />;
}
