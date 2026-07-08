export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  teamId?: string;
}

const STORAGE_KEYS = {
  figma: 'figma_tokens',
  miro: 'miro_tokens',
};

/**
 * Saves token data to localStorage for a given platform.
 */
export function saveToken(platform: 'figma' | 'miro', data: TokenData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS[platform], JSON.stringify(data));
  } catch (err) {
    console.error(`Failed to save ${platform} token:`, err);
  }
}

/**
 * Reads token data from localStorage for a given platform.
 */
export function getToken(platform: 'figma' | 'miro'): TokenData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[platform]);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`Failed to read ${platform} token:`, err);
    return null;
  }
}

/**
 * Clears token data from localStorage (logging out).
 */
export function clearToken(platform: 'figma' | 'miro'): void {
  if (typeof window === 'undefined') return;
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
  // If current time + 5 minutes is greater than expiration time
  const BufferMs = 5 * 60 * 1000;
  return Date.now() + BufferMs >= tokenData.expiresAt;
}

/**
 * Retrieves a valid, unexpired token.
 * If the token is near expiration, it calls the backend refresh endpoint to refresh it in place.
 */
export async function getValidToken(platform: 'figma' | 'miro'): Promise<string | null> {
  const tokenData = getToken(platform);

  if (!tokenData) {
    return null;
  }

  // If token is still fresh, return it
  if (!isTokenExpiring(tokenData)) {
    return tokenData.accessToken;
  }

  // Token is expiring, trigger a refresh call to the serverless proxy
  try {
    const response = await fetch('/api/oauth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform,
        refreshToken: tokenData.refreshToken,
      }),
    });

    if (!response.ok) {
      // If refresh fails, clear token (requires user re-auth)
      console.warn(`${platform} refresh token failed; clearing credentials.`);
      clearToken(platform);
      return null;
    }

    const newData = await response.json();
    const updatedTokenData: TokenData = {
      accessToken: newData.accessToken,
      refreshToken: newData.refreshToken,
      expiresAt: newData.expiresAt,
      teamId: tokenData.teamId, // maintain team metadata if present
    };

    saveToken(platform, updatedTokenData);
    return updatedTokenData.accessToken;
  } catch (err) {
    console.error(`Failed to refresh ${platform} token:`, err);
    return null;
  }
}
