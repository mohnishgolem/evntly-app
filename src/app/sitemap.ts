import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  const [{ data: vendors }, { data: bundles }] = await Promise.all([
    supabase
      .from("service_providers")
      .select("id, updated_at")
      .eq("status", "approved"),
    supabase.from("combined_packages").select("id, updated_at").eq("status", "active"),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/explore`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/bundles`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/plan`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/vendor-signup`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy-policy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const vendorRoutes: MetadataRoute.Sitemap = (vendors ?? []).map((v) => ({
    url: `${SITE_URL}/vendor/${v.id}`,
    lastModified: v.updated_at ?? undefined,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const bundleRoutes: MetadataRoute.Sitemap = (bundles ?? []).map((b) => ({
    url: `${SITE_URL}/bundles/${b.id}`,
    lastModified: b.updated_at ?? undefined,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...vendorRoutes, ...bundleRoutes];
}
