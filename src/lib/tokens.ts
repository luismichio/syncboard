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
    const response = await fetch('/api/oauth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform,
        refreshToken: tokenData.refreshToken,
      }),
    });

    if (!response.ok) {
      console.warn(`${platform} refresh token failed; clearing credentials.`);
      await clearToken(platform);
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
    console.error(`Failed to refresh ${platform} token:`, err);
    return null;
  }
}
