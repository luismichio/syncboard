'use client';

import { useSyncExternalStore } from 'react';
import { DISPLAY } from '@/lib/version';

const emptySubscribe = (): (() => void) => () => {};

function getSnapshot(): string {
  return DISPLAY;
}

// Server + hydration snapshot: empty, so the SSR HTML has no version text
// and can never mismatch the client (which fills it in after hydration).
function getServerSnapshot(): string {
  return '';
}

/**
 * Version + plan stamp, rendered client-side only.
 *
 * DISPLAY is derived from src/lib/version.generated.ts, which
 * scripts/inject-version.mjs regenerates at dev/build start. Rendering it
 * only after hydration keeps the server HTML and the client bundle in sync
 * even when a long-running dev server still holds a stale module — preventing
 * React hydration mismatches in the plugin footers.
 */
export function VersionStamp({ as = 'span', className }: { as?: 'span' | 'p' | 'div'; className?: string }) {
  const display = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
  if (!display) return null;
  const Tag = as;
  // Default style = the design-system footer stamp; callers may override
  // with a className (e.g. the /docs badge).
  const styleClass =
    className ?? 'text-center text-[9px] font-mono text-text-muted/50';
  return <Tag className={styleClass}>{display}</Tag>;
}