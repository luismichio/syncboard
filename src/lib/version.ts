/**
 * Single source of truth for version and plan identifiers.
 *
 * Change package.json → version and plan propagate everywhere.
 * All UI components import from here instead of hardcoding.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version, plan } = require("../../package.json");

export const VERSION: string = version as string;
export const PLAN: string = (plan as string) || "community";
export const DISPLAY: string = `v${VERSION} ${PLAN.charAt(0).toUpperCase()}${PLAN.slice(1)}`;
