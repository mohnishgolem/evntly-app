import { expect, it } from "vitest";
import { readMigration, setupDb } from "./supabase-stub";

// 20261122090000_listing_portfolio_covers: service_providers.portfolio_urls is
// a cache of the listing's first 4 portfolio images, recomputed by the
// database. Offline in PGlite, never against production.
const prereqs = `
  alter table public.service_providers add column if not exists portfolio_urls text[];
  create table public.portfolio_items (
    id text primary key default gen_random_uuid()::text,
    created_at timestamptz not null default now(),
    provider_id text, media_type text, media_url text, sort_order integer
  );
`;
const up = readMigration("migrations/20261122090000_listing_portfolio_covers.sql");
const down = readMigration("rollbacks/20261122090000_listing_portfolio_covers.down.sql");

const urls = async (d: Awaited<ReturnType<typeof setupDb>>, id: string) =>
  ((await d.db.query("select portfolio_urls from public.service_providers where id = $1", [id])).rows[0] as {
    portfolio_urls: string[] | null;
  }).portfolio_urls;

it("keeps portfolio_urls in sync with the listing's images", { timeout: 60_000 }, async () => {
  const d = await setupDb([prereqs]);
  await d.db.exec(`
    insert into public.service_providers (id, name) values ('sp1', 'Photo Co'), ('sp2', 'DJ Co');
    insert into public.portfolio_items (id, provider_id, media_type, media_url, sort_order, created_at) values
      ('a', 'sp1', 'image', 'https://x/a.jpg', 2, now()),
      ('b', 'sp1', 'image', 'https://x/b.jpg', 1, now()),
      ('c', 'sp1', 'video', 'https://x/c.mp4', 0, now()),
      ('d', 'sp1', 'image', 'https://x/d.HEIC', 0, now());
  `);

  // Backfill on migrate: images only, no HEIC, in the vendor's order.
  await d.db.exec(up);
  expect(await urls(d, "sp1")).toEqual(["https://x/b.jpg", "https://x/a.jpg"]);
  expect(await urls(d, "sp2")).toEqual([]);

  // Uploads, deletes and reorders follow automatically; capped at 4.
  await d.db.exec(`
    insert into public.portfolio_items (id, provider_id, media_type, media_url, sort_order) values
      ('e', 'sp1', 'image', 'https://x/e.jpg', 0), ('f', 'sp1', 'image', 'https://x/f.jpg', 5), ('g', 'sp1', 'image', 'https://x/g.jpg', 6);
  `);
  expect(await urls(d, "sp1")).toEqual(["https://x/e.jpg", "https://x/b.jpg", "https://x/a.jpg", "https://x/f.jpg"]);
  await d.db.exec(`delete from public.portfolio_items where id = 'e'; update public.portfolio_items set sort_order = 9 where id = 'b';`);
  expect(await urls(d, "sp1")).toEqual(["https://x/a.jpg", "https://x/f.jpg", "https://x/g.jpg", "https://x/b.jpg"]);

  // Moving a photo between listings updates both.
  await d.db.exec(`update public.portfolio_items set provider_id = 'sp2' where id = 'g';`);
  expect(await urls(d, "sp2")).toEqual(["https://x/g.jpg"]);
  expect(await urls(d, "sp1")).not.toContain("https://x/g.jpg");

  // Whatever a client writes is replaced with the real list.
  await d.db.exec(`update public.service_providers set portfolio_urls = array['https://evil.example/x.jpg'] where id = 'sp2';`);
  expect(await urls(d, "sp2")).toEqual(["https://x/g.jpg"]);

  // Rollback removes the triggers and clears the cache.
  await d.db.exec(down);
  expect(await urls(d, "sp1")).toBeNull();
  await d.db.exec(`insert into public.portfolio_items (provider_id, media_type, media_url) values ('sp1', 'image', 'https://x/z.jpg');`);
  expect(await urls(d, "sp1")).toBeNull();
});
