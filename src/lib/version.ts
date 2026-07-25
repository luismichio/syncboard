/**
 * Single source of truth for version and plan identifiers.
 *
 * On first checkout (before running inject-version), falls back to package.json.
 * During dev/build, scripts/inject-version.mjs writes src/lib/version.generated.ts
 * with hardcoded strings, ensuring the displayed version always matches package.json
 * regardless of bundler caching.
 */

interface VersionInfo {
  version: string;
  plan: string;
}

function loadVersion(): VersionInfo {
  // Prefer the generated file (written by inject-version.mjs during dev/build)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const generated = require('./version.generated') as { VERSION: string; PLAN: string };
    return { version: generated.VERSION, plan: generated.PLAN };
  } catch {
    // Fallback for first checkout before running inject-version
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version, plan } = require('../../package.json');
    return { version: version as string, plan: (plan as string) || 'community' };
  }
}

const { version, plan } = loadVersion();

export const VERSION: string = version;
export const PLAN: string = plan;
export const DISPLAY: string = `v${VERSION} ${PLAN.charAt(0).toUpperCase()}${PLAN.slice(1)}`;
