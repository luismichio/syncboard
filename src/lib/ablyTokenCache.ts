/**
 * R5: client-side Ably token cache.
 *
 * Every relay call used to re-fetch /api/ably/token (1 Vercel invocation + 1
 * Ably requestToken). Tokens carry a 2h TTL; Miro connections idle-close at
 * 30s, so within a session most calls can reuse the same token. The cache is
 * module-level (per tab), keyed by pairing+platform+session, and invalidated
 * on conflict/capacity/transfer so re-admission always gets a fresh lease.
 */

export interface CachedAblyToken {
  details: Record<string, unknown>;
  expiresAt: number;
}

const TOKEN_CACHE_MAX_ENTRIES = 50;
const TOKEN_REUSE_MARGIN_MS = 5 * 60_000; // don't reuse within 5min of expiry
const store = new Map<string, CachedAblyToken>();

export function ablyTokenCacheKey(
  pairingId: string,
  platform: string,
  sessionId: string
): string {
  return `miro:${platform}:${pairingId}:${sessionId}`;
}

export function getCachedAblyToken(key: string): Record<string, unknown> | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt - TOKEN_REUSE_MARGIN_MS) {
    store.delete(key);
    return null;
  }
  return entry.details;
}

export function setCachedAblyToken(key: string, details: Record<string, unknown>): void {
  const expiresRaw = details.expires;
  const expiresAt =
    typeof expiresRaw === 'number' ? expiresRaw : Date.now() + 2 * 60 * 60 * 1000;
  store.set(key, { details, expiresAt });
  if (store.size > TOKEN_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, entry] of store) {
      if (now > entry.expiresAt) store.delete(k);
    }
  }
}

export function invalidateAblyToken(key: string): void {
  store.delete(key);
}

export function invalidateAllAblyTokens(): void {
  store.clear();
}
