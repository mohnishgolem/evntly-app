import Link from "next/link";
import { LAUNCH_CATEGORIES, VENDOR_CATEGORIES, categoryPlural, isLaunchCategory } from "@/lib/config";
import { categoryPath } from "@/lib/seo";
import { CategoryArt } from "@/components/category-art";

const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));
// Tile labels: the plural, capitalised, with two kept short for small tiles.
const SHORT: Record<string, string> = { mc: "MCs", cakes_desserts: "Cakes & desserts" };
const tileLabel = (value: string) => SHORT[value] ?? categoryPlural(value).charAt(0).toUpperCase() + categoryPlural(value).slice(1);

// Every live category as a raised tile with its 3D illustration. Phones: one
// swipeable row of compact buttons. Wider: a grid. Links go to the indexable
// /sydney/<category> pages (SEO) where they exist.
export function CategoryRail() {
  return (
    <ul className="rail -mx-4 auto-cols-[6.5rem] gap-2.5 px-4 pt-1 pb-3 sm:mx-0 sm:grid sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:px-0 md:grid-cols-6">
      {categories.map((c, i) => (
        <li key={c.value}>
          <Link
            href={isLaunchCategory(c.value) ? categoryPath(c.value) : `/explore?category=${c.value}`}
            className="group btn-raised flex h-full flex-col items-center gap-1.5 rounded-tile px-1 pt-2.5 pb-2.5 text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:gap-2 sm:px-3 sm:pt-4 sm:pb-4"
          >
            <span className="flex size-14 items-center justify-center rounded-2xl [background:var(--gradient-tile)] sm:size-20">
              <CategoryArt
                value={c.value}
                eager={i < 6}
                className="size-12 drop-shadow-[0_6px_6px_rgba(28,25,23,0.18)] transition-transform duration-300 ease-standard group-hover:-translate-y-0.5 group-hover:scale-105 sm:size-16"
              />
            </span>
            <span className="line-clamp-2 text-[11.5px] leading-tight font-semibold sm:text-sm">{tileLabel(c.value)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
