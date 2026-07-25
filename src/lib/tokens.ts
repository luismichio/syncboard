export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  teamId?: string;
}

/**
 * Derives a short deployment fingerprint from the app URL.
 * This prevents token collisions when multiple SyncBoard instances
 * share the same Miro board storage namespace.
 */
function deploymentFingerprint(): string {
  if (typeof window === 'undefined') return '';
  try {
    // Use origin as a deterministic namespace -- fast hash to ~8 chars
    const origin = window.location.origin;
    let hash = 0;
    for (let i = 0; i < origin.length; i++) {
      const chr = origin.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return '_' + Math.abs(hash).toString(36);
  } catch {
    return '';
  }
}

const FP = deploymentFingerprint();
const STORAGE_KEYS = {
  figma: `figma_tokens${FP}`,
  miro: `miro_tokens${FP}`,
};

const MIRO_STORAGE_TIMEOUT_MS = 1500;
const REFRESH_TIMEOUT_MS = 15000;

type MiroStorageApi = {
  get: (key: string) => Promise<string | undefined>;
  set: (key: string, value: string) => Promise<void>;
};

function getMiroStorageApi(): MiroStorageApi | null {
  if (typeof window === 'undefined') return null;

  const storageCandidate = window.miro?.board?.storage as unknown;
  if (!storageCandidate || typeof storageCandidate !== 'object') return null;

  const storageObj = storageCandidate as { get?: unknown; set?: unknown };
  if (typeof storageObj.get !== 'function' || typeof storageObj.set !== 'function') {
    return null;
  }

  return storageObj as MiroStorageApi;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function parseTokenData(raw: string): TokenData | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const obj = parsed as Record<string, unknown>;
    if (
      typeof obj.accessToken !== 'string' ||
      typeof obj.expiresAt !== 'number'
    ) {
      return null;
    }

    return {
      accessToken: obj.accessToken,
      refreshToken: typeof obj.refreshToken === 'string' ? obj.refreshToken : '',
      expiresAt: obj.expiresAt,
      teamId: typeof obj.teamId === 'string' ? obj.teamId : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Saves token data — always writes to localStorage (fast local cache) and
 * also attempts Miro board storage (survives browser cache clears).
 */
export async function saveToken(platform: 'figma' | 'miro', data: TokenData): Promise<void> {
  if (typeof window === 'undefined') return;

  // Always write to localStorage as a local cache — this is the fast path
  // for reads on iframe reload, before Miro board storage has synced.
  try {
    localStorage.setItem(STORAGE_KEYS[platform], JSON.stringify(data));
  } catch (err) {
    console.error(`Failed to save ${platform} token in localStorage:`, err);
  }

  // Also persist to Miro board storage (survives browser cache clears).
  // Errors here are non-fatal — localStorage is the primary read path.
  const miroStorage = getMiroStorageApi();
  if (miroStorage) {
    try {
      await withTimeout(
        miroStorage.set(STORAGE_KEYS[platform], JSON.stringify(data)),
        MIRO_STORAGE_TIMEOUT_MS,
        'Miro board.storage.set'
      );
    } catch (err) {
      console.warn('Failed to write to Miro board storage:', err);
    }
  }
}

/**
 * Reads token data — checks localStorage first (instant, works immediately on
 * iframe reload), falls back to Miro board storage (survives cache clears).
 */
export async function getToken(platform: 'figma' | 'miro'): Promise<TokenData | null> {
  if (typeof window === 'undefined') return null;

  // 1. Read from localStorage first — this is the fast path on iframe reload.
  //    saveToken() always writes here, so it's available before board storage syncs.
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[platform]);
    if (raw) {
      const parsed = parseTokenData(raw);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn(`Failed to read ${platform} token from localStorage:`, err);
  }

  // 2. Fall back to Miro board storage (survives browser cache clears).
  //    This handles the case where localStorage was cleared but board storage still has it.
  const miroStorage = getMiroStorageApi();
  if (miroStorage) {
    try {
      const raw = await withTimeout(
        miroStorage.get(STORAGE_KEYS[platform]),
        MIRO_STORAGE_TIMEOUT_MS,
        'Miro board.storage.get'
      );
      if (raw) {
        const parsed = parseTokenData(raw);
        // Populate localStorage so the next read is instant.
        if (parsed) {
          try { localStorage.setItem(STORAGE_KEYS[platform], raw); } catch {}
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to read from Miro board storage:', err);
    }
  }

  return null;
}

/**
 * Clears token data from both localStorage and Miro board storage.
 */
export async function clearToken(platform: 'figma' | 'miro'): Promise<void> {
  if (typeof window === 'undefined') return;

  // Always clear localStorage first.
  try {
    localStorage.removeItem(STORAGE_KEYS[platform]);
  } catch (err) {
    console.error(`Failed to clear ${platform} token from localStorage:`, err);
  }

  // Also clear from Miro board storage.
  const miroStorage = getMiroStorageApi();
  if (miroStorage) {
    try {
      await withTimeout(
        miroStorage.set(STORAGE_KEYS[platform], ''),
        MIRO_STORAGE_TIMEOUT_MS,
        'Miro board.storage.set'
      );
    } catch (err) {
      console.warn('Failed to clear Miro board storage:', err);
    }
  }
}

/**
 * Check if the token is expired or expiring in less than 5 minutes.
 */
export function isTokenExpiring(tokenData: TokenData | null): boolean {
  if (!tokenData) return true;
  const bufferMs = 5 * 60 * 1000;
  return Date.now() + bufferMs >= tokenData.expiresAt;
}

/**
 * Retrieves a valid, unexpired token.
 * If the token is near expiration, it calls the backend refresh endpoint.
 *
 * Issue 4 fix: We NEVER clear the old token on a single refresh failure.
 * Transient failures (server cold start, network glitch) should not force
 * re-authentication. The old token stays in storage and the next page load
 * will retry the refresh. The only way tokens are cleared is via explicit
 * user action (Disconnect button).
 */
export async function getValidToken(platform: 'figma' | 'miro'): Promise<string | null> {
  const tokenData = await getToken(platform);
  if (!tokenData) {
    return null;
  }

  // If token is still fresh, return it
  if (!isTokenExpiring(tokenData)) {
    return tokenData.accessToken;
  }

  // If we don't have a refresh token (provider omitted it), keep using access token
  // until real expiry instead of disconnecting early at the buffer window.
  if (!tokenData.refreshToken) {
    return Date.now() < tokenData.expiresAt ? tokenData.accessToken : null;
  }

  // Token is expiring, trigger refresh call
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

    const response = await fetch('/api/oauth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Refresh-Token': tokenData.refreshToken,
      },
      body: JSON.stringify({ platform }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Don't clear — keep old token for retry on next page load
      console.warn(`${platform} refresh failed (HTTP ${response.status}), keeping old token for retry`);
      return null;
    }

    const rawData: unknown = await response.json();
    if (!rawData || typeof rawData !== 'object') {
      console.warn(`${platform} refresh returned invalid payload, keeping old token for retry`);
      return null;
    }

    const data = rawData as Record<string, unknown>;
    if (
      typeof data.accessToken !== 'string' ||
      typeof data.refreshToken !== 'string' ||
      typeof data.expiresAt !== 'number'
    ) {
      console.warn(`${platform} refresh payload missing required fields, keeping old token for retry`);
      return null;
    }

    const updatedTokenData: TokenData = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      teamId: tokenData.teamId,
    };

    await saveToken(platform, updatedTokenData);
    return updatedTokenData.accessToken;
  } catch (err) {
    // Network error / timeout — old token stays, retry on next load
    console.warn(`Failed to refresh ${platform} token (network error/timeout), keeping old token for retry:`, err);
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
