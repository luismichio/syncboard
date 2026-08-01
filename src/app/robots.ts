import type { MetadataRoute } from "next";
import { headers } from "next/headers";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  // Allow indexing ONLY on the primary production domain (syncingboard.com / www.syncingboard.com).
  // Block search crawlers on preview domains, dev environments, and former domain aliases.
  const isProduction = host === "syncingboard.com" || host === "www.syncingboard.com";

  if (!isProduction) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/miro-plugin"],
    },
    sitemap: "https://syncingboard.com/sitemap.xml",
  };
}
