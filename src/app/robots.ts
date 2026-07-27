import type { MetadataRoute } from "next";
import { headers } from "next/headers";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  // Block search crawlers on dev domain, staging, or Vercel preview builds
  const isDevDomain = host.includes("syncboard-dev") || host.includes("vercel.app");

  if (isDevDomain) {
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
    sitemap: "https://syncboard.luiskobayashi.com/sitemap.xml",
  };
}
