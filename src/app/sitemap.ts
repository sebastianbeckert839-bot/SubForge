import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";
import { TOOLS } from "@/lib/tools";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...TOOLS.map((t) => ({
      // indexable per-tool URL (the page metadata + client both understand ?tool=)
      url: `${SITE_URL}/?tool=${t.id}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: t.id === "rebasser" ? 0.9 : 0.8,
    })),
  ];
}
