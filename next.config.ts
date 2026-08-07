import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['*.loca.lt', '*.localtunnel.me', '*.ngrok-free.app', '*.trycloudflare.com', '*.protokoba.com'],
  async headers() {
    return [
      {
        source: "/penpot-companion-plugin.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
      {
        source: "/penpot-companion-ui.html",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
      {
        source: "/penpot-manifest.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
      // Dev-mode only: keep chunk URLs no-store so embedded caches (Figma
      // desktop app) cannot serve an old bundle under a stable chunk name.
      ...(process.env.NODE_ENV === "development"
        ? [
            {
              source: "/_next/static/chunks/:path*",
              headers: [{ key: "Cache-Control", value: "no-store" }],
            },
          ]
        : []),
    ];
  },
};

export default nextConfig;
