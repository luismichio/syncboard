import { BUILD } from '@/lib/version';

/**
 * Reports the local/current build id (e.g. "local-abc1234") so the static
 * companion pages (Figma/Penpot HTML) can append it to their version badge.
 *
 * version.ts already compiles BUILD to '' whenever the bundle is built with
 * NODE_ENV=production, so this endpoint returns a non-empty build id only in
 * dev (`next dev`); production and preview deployments always get "".
 */
export function GET() {
  return Response.json({ ok: true, build: BUILD });
}
