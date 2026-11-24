import Link from "next/link";
import { LAUNCH_CATEGORIES, VENDOR_CATEGORIES, categoryPlural, isLaunchCategory } from "@/lib/config";
import { categoryPath } from "@/lib/seo";

const categories = VENDOR_CATEGORIES.filter((c) => LAUNCH_CATEGORIES.includes(c.value));
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Every live category as a tile: icon in a soft square, plural label. Links
// go to the indexable /sydney/<category> pages (SEO) where they exist.
export function CategoryRail() {
  return (
    <ul className="rail -mx-4 auto-cols-[7.25rem] gap-3 px-4 pb-1 sm:mx-0 sm:grid sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
      {categories.map((c) => (
        <li key={c.value}>
          <Link
            href={isLaunchCategory(c.value) ? categoryPath(c.value) : `/explore?category=${c.value}`}
            className="group press flex h-full flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-shadow duration-300 ease-standard hover:shadow-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <c.icon className="size-[22px]" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="text-sm leading-tight font-semibold">{title(categoryPlural(c.value))}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
