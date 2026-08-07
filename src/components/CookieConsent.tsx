'use client';

import { useState, useEffect } from 'react';

const CONSENT_KEY = 'syncingboard_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show on public pages (not the plugin iframes)
    if (
      typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/miro-plugin') ||
        window.location.pathname.startsWith('/figjam-plugin') ||
        window.location.pathname.startsWith('/figjam-mirror'))
    ) {
      return;
    }

    const handleOpen = () => setVisible(true);
    window.addEventListener('show-cookie-consent', handleOpen);

    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      // Delay showing the banner slightly so it doesn't flash immediately
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('show-cookie-consent', handleOpen);
      };
    }

    return () => window.removeEventListener('show-cookie-consent', handleOpen);
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    // Update consent to granted — GA will start tracking
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
      });
    }
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    // Consent remains denied (already set as default) — no need to update
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-bg-card border-t border-border-card shadow-lg animate-fade-in"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-xs text-text-muted leading-relaxed flex-1">
          This site uses Google Analytics to measure anonymous usage data (page views, feature interactions).
          No personal data is collected. You can accept or decline.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={decline}
            className="text-[10px] font-mono font-bold px-3 py-1.5 rounded border border-border-card text-text-muted hover:text-text-page hover:bg-bg-page transition cursor-pointer"
          >
            DECLINE
          </button>
          <button
            onClick={accept}
            className="text-[10px] font-mono font-bold px-3 py-1.5 rounded bg-accent text-bg-page hover:opacity-90 transition cursor-pointer"
          >
            ACCEPT
          </button>
        </div>
      </div>
    </div>
  );
}
