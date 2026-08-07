'use client';

import { useEffect } from 'react';

/**
 * Loads the Miro Web SDK (v2) inside the Miro plugin iframe only.
 *
 * Previously the SDK script was injected globally in the root layout, which
 * made every other page (including the FigJam plugin mirror) log
 * "Miro SDK is not connected". useMiroSelection already polls for window.miro,
 * so a late script load is safe here.
 */
export function MiroSdkBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined' || window.miro) return;
    const script = document.createElement('script');
    script.src = 'https://miro.com/app/static/sdk/v2/miro.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);
  return null;
}
