import type { Metadata } from "next";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";

const SITE_URL = "https://www.syncingboard.com";

import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const isDevDomain = host.includes("syncingboard-dev") || host.includes("vercel.app");

  return {
    title: "SyncingBoard",
    description:
      "SyncingBoard is a stateless, self-hosted integration that syncs Figma and Penpot frame screenshots into Miro in-place with zero duplicates.",
    icons: {
      icon: "/syncingboard_logo.svg",
    },
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "SyncingBoard",
      title: "SyncingBoard — Stateless Figma/Penpot-Miro Pipeline",
      description:
        "A database-free, self-hosted integration that syncs Figma and Penpot frame screenshots into Miro in-place with zero duplicates.",
      url: SITE_URL,
      images: [
        {
          url: "/syncingboard_logo_color.svg",
          width: 480,
          height: 480,
          alt: "SyncingBoard logo",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "SyncingBoard — Stateless Figma/Penpot-Miro Pipeline",
      description:
        "A database-free, self-hosted integration that syncs Figma and Penpot frame screenshots into Miro in-place with zero duplicates.",
      images: ["/syncingboard_logo_color.svg"],
    },
    keywords: [
      "Figma",
      "Miro",
      "Penpot",
      "sync",
      "design handoff",
      "design-to-whiteboard",
      "self-hosted",
      "open source",
    ],
    robots: isDevDomain
      ? {
          index: false,
          follow: false,
          nocache: true,
          googleBot: {
            index: false,
            follow: false,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
          },
        },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        {/* Google Consent Mode v2 — default deny before GA loads */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', wait_for_update: 500 }); window.__sbSkipGA = (typeof location !== 'undefined' && (location.pathname.indexOf('/figjam-plugin') === 0 || location.pathname.indexOf('/figjam-mirror') === 0)) ? true : false;`,
          }}
        />
        {/* Google Analytics — never loaded on the FigJam plugin route */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if (!window.__sbSkipGA) { var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=G-Q4W94QDWWC'; document.head.appendChild(s); }`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `if (!window.__sbSkipGA) { window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'G-Q4W94QDWWC'); }`,
          }}
        />
        {/* Structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "SyncingBoard",
              url: SITE_URL,
              description:
                "A stateless, self-hosted integration that syncs Figma and Penpot frame screenshots into Miro in-place with zero duplicates.",
              applicationCategory: "DesignApplication",
              operatingSystem: "All",
            }),
          }}
        />
        <script src="https://miro.com/app/static/sdk/v2/miro.js" defer></script>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const saved = localStorage.getItem('theme');
                  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.add('light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-bg-page text-text-page">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
