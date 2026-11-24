"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CategoryArt } from "@/components/category-art";
import { dismissPlannerSuggestion } from "@/lib/actions/planner";
import { countLabel, type Recommendation } from "@/lib/planner/recommendations";
import { rememberPlanEvent } from "@/lib/planner/context";
import { trackPlanner } from "@/lib/track-client";

// "More ideas for your event": categories that suit this kind of event and
// aren't on the plan yet, each with a real count and a path into search that
// keeps the event's context (see planner/context).
export function IdeaCards({ eventId, eventType, ideas }: { eventId: string; eventType: string; ideas: Recommendation[] }) {
  const [list, remove] = useOptimistic(ideas, (current, key: string) => current.filter((i) => i.key !== key));
  const [, start] = useTransition();
  const router = useRouter();

  if (list.length === 0) {
    return (
      <div className="rounded-tile border border-dashed border-border px-5 py-6 text-center">
        <p className="font-semibold">You&apos;ve covered the essentials</p>
        <p className="mt-1 text-sm text-muted-foreground">Every category that usually suits a {eventType.toLowerCase()} is on your plan.</p>
        <Link
          href={`/explore?event=${encodeURIComponent(eventType)}`}
          onClick={() => rememberPlanEvent(eventId)}
          className="mt-3 inline-flex h-11 items-center text-sm font-semibold underline underline-offset-2"
        >
          Browse all vendors
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-2.5 sm:grid-cols-2">
      {list.slice(0, 6).map((idea) => (
        <li key={idea.key} className="relative">
          <Link
            href={`/explore?category=${idea.service}&event=${encodeURIComponent(eventType)}`}
            onClick={() => {
              rememberPlanEvent(eventId);
              trackPlanner("recommendation_clicked", eventId, idea.key);
            }}
            className="lift surface-raised flex min-h-[5.5rem] items-center gap-3.5 rounded-tile py-3 pr-11 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-[0.875rem] bg-[image:var(--gradient-tile)]">
              <CategoryArt value={idea.service} className="size-14" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{idea.title}</span>
              <span className="line-clamp-2 block text-[13px] text-muted-foreground">{idea.why}</span>
              <span className="mt-0.5 block text-xs font-semibold text-foreground/75">{countLabel(idea)}</span>
            </span>
          </Link>
          <button
            type="button"
            aria-label={`Hide "${idea.title}"`}
            onClick={() =>
              start(async () => {
                remove(idea.key);
                await dismissPlannerSuggestion(eventId, idea.key);
                router.refresh();
              })
            }
            className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
