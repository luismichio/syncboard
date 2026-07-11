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

/**
 * Saves token data to Miro board storage if inside Miro, or falls back to localStorage.
 */
export async function saveToken(platform: 'figma' | 'miro', data: TokenData): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. If running inside Miro board, write to Miro's native App storage to bypass iframe cookie block
  if (window.miro?.board?.storage) {
    try {
      await window.miro.board.storage.set(STORAGE_KEYS[platform], JSON.stringify(data));
      return;
    } catch (err) {
      console.warn(`Failed to write to Miro board storage, falling back to localStorage:`, err);
    }
  }

  // 2. Otherwise, fall back to standard localStorage
  try {
    localStorage.setItem(STORAGE_KEYS[platform], JSON.stringify(data));
  } catch (err) {
    console.error(`Failed to save ${platform} token in localStorage:`, err);
  }
}

/**
 * Reads token data from Miro board storage or falls back to localStorage.
 */
export async function getToken(platform: 'figma' | 'miro'): Promise<TokenData | null> {
  if (typeof window === 'undefined') return null;

  // 1. Read from Miro's native App storage if inside Miro
  if (window.miro?.board?.storage) {
    try {
      const raw = await window.miro.board.storage.get(STORAGE_KEYS[platform]);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      console.warn(`Failed to read from Miro board storage:`, err);
    }
  }

  // 2. Otherwise, read from standard localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[platform]);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`Failed to read ${platform} token from localStorage:`, err);
    return null;
  }
}

/**
 * Clears token data from Miro board storage or localStorage.
 */
export async function clearToken(platform: 'figma' | 'miro'): Promise<void> {
  if (typeof window === 'undefined') return;

  if (window.miro?.board?.storage) {
    try {
      await window.miro.board.storage.set(STORAGE_KEYS[platform], '');
      return;
    } catch (err) {
      console.warn(`Failed to clear Miro board storage:`, err);
    }
  }

  try {
    localStorage.removeItem(STORAGE_KEYS[platform]);
  } catch (err) {
    console.error(`Failed to clear ${platform} token:`, err);
  }
}

/**
 * Check if the token is expired or expiring in less than 5 minutes.
 */
export function isTokenExpiring(tokenData: TokenData | null): boolean {
  if (!tokenData) return true;
  const BufferMs = 5 * 60 * 1000;
  return Date.now() + BufferMs >= tokenData.expiresAt;
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

  // Token is expiring, trigger refresh call
  try {
    // return the old token on network error so the UI can still attempt operations
    const response = await fetch('/api/oauth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform,
        refreshToken: tokenData.refreshToken,
      }),
    });

    if (!response.ok) {
      // Don't clear — keep the old token for retry on next page load
      console.warn(`${platform} refresh failed (HTTP ${response.status}), keeping old token for retry`);
      return null;
    }

    const newData = await response.json();
    const updatedTokenData: TokenData = {
      accessToken: newData.accessToken,
      refreshToken: newData.refreshToken,
      expiresAt: newData.expiresAt,
      teamId: tokenData.teamId,
    };

    await saveToken(platform, updatedTokenData);
    return updatedTokenData.accessToken;
  } catch (err) {
    // Network error — old token stays, retry on next load
    console.warn(`Failed to refresh ${platform} token (network error), keeping old token for retry:`, err);
    return null;
  }
}
