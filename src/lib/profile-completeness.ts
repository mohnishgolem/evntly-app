// What a vendor listing still needs before customers can judge it at a
// glance. Only facts about the listing itself — nothing estimated.

export type CompletenessInput = {
  id: string;
  bio: string | null;
  abn: string | null;
  locations_serviced: string[] | null;
  event_types: string[] | null;
  photoCount: number;
  packageCount: number;
};

export type ChecklistItem = { key: string; label: string; done: boolean; href: string };

/** Customers skim short bios; a couple of sentences is the floor. */
export const MIN_BIO_LENGTH = 60;
/** One photo looks like a placeholder; three shows a body of work. */
export const MIN_PHOTOS = 3;

export function profileChecklist(l: CompletenessInput): ChecklistItem[] {
  const edit = `/vendor-dashboard/edit/${l.id}`;
  return [
    { key: "photos", label: `Add at least ${MIN_PHOTOS} photos of your work`, done: l.photoCount >= MIN_PHOTOS, href: "/vendor-dashboard/portfolio" },
    { key: "packages", label: "Add a package so customers see what's included", done: l.packageCount > 0, href: "/vendor-dashboard/pricing" },
    { key: "bio", label: "Write a short description of your business", done: (l.bio?.trim().length ?? 0) >= MIN_BIO_LENGTH, href: edit },
    { key: "areas", label: "List the areas you service", done: !!l.locations_serviced?.length, href: edit },
    { key: "events", label: "Choose the events you cover", done: !!l.event_types?.length, href: edit },
    { key: "abn", label: "Add your ABN", done: !!l.abn, href: edit },
  ];
}

export function completenessPercent(items: ChecklistItem[]) {
  return items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 100;
}
