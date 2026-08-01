import type { MetadataRoute } from "next";
import { getAllDocs } from "@/lib/docs";

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = getAllDocs();

  const docEntries: MetadataRoute.Sitemap = docs.map((doc) => ({
    url: `https://syncingboard.com/docs/${doc.slug}`,
    lastModified: new Date(doc.updatedAt),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: "https://syncingboard.com",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: "https://syncingboard.com/docs",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...docEntries,
  ];
}
