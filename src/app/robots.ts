import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/miro-plugin"],
    },
    sitemap: "https://syncboard.luiskobayashi.com/sitemap.xml",
  };
}
