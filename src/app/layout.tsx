import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SyncBoard",
  description: "Stateless Figma-Miro Sync Engine",
  icons: {
    icon: "/syncboard_logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <head>
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
      <body className="min-h-full flex flex-col bg-bg-page text-text-page">{children}</body>
    </html>
  );
}
