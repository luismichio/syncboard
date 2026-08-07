'use client';

import { useEffect, useState } from 'react';
import { DISPLAY } from '@/lib/version';

/**
 * Version + plan stamp, rendered client-side only.
 *
 * DISPLAY is derived from src/lib/version.generated.ts, which
 * scripts/inject-version.mjs regenerates at dev/build start. Rendering it
 * only after mount keeps the server HTML and the client bundle in sync even
 * when a long-running dev server still holds a stale module — preventing
 * React hydration mismatches in the plugin footers.
 */
export function VersionStamp() {
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    setDisplay(DISPLAY);
  }, []);

  if (display === null) return null;
  return <p className="text-center text-[9px] font-mono text-text-muted/50">{display}</p>;
}
