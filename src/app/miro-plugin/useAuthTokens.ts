import { useEffect, useState } from 'react';
import { getValidToken, clearToken, saveToken, TokenData } from '@/lib/tokens';

const MIRO_BOOT_WAIT_MS = 8000;
const MIRO_BOOT_POLL_MS = 50;
const BOOT_RETRY_DELAY_MS = 5000;
const MAX_BOOT_RETRIES = 3;

function generateSecureState(prefix: string): string {
  try {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    let securePart = '';
    for (let i = 0; i < 16; i++) {
      securePart += chars[array[i] % chars.length];
    }
    return `${prefix}_${securePart}`;
  } catch {
    return prefix + '_' + Math.random().toString(36).substring(2, 15);
  }
}

function normalizeTokenData(value: unknown): TokenData | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  if (typeof obj.accessToken !== 'string' || !obj.accessToken) {
    return null;
  }

  const refreshToken = typeof obj.refreshToken === 'string' ? obj.refreshToken : '';
  const expiresAt = typeof obj.expiresAt === 'number' && Number.isFinite(obj.expiresAt)
    ? obj.expiresAt
    : (Date.now() + 3600 * 1000);

  return {
    accessToken: obj.accessToken,
    refreshToken,
    expiresAt,
    teamId: typeof obj.teamId === 'string' ? obj.teamId : undefined,
  };
}

/**
 * Handles loading, updating, and synchronizing auth tokens across tabs.
 * Waits for Miro SDK initialisation before trying board storage-backed token access.
 */
export function useAuthTokens(isInitMode: boolean | null) {
  const [figmaToken, setFigmaToken] = useState<string | null>(null);
  const [miroToken, setMiroToken] = useState<string | null>(null);
  const [tokensLoading, setTokensLoading] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;
    let retryCount = 0;
    let waitInterval: ReturnType<typeof setInterval> | null = null;
    let waitTimeout: ReturnType<typeof setTimeout> | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearWaitTimers = () => {
      if (waitInterval) {
        clearInterval(waitInterval);
        waitInterval = null;
      }
      if (waitTimeout) {
        clearTimeout(waitTimeout);
        waitTimeout = null;
      }
    };

    const waitForMiro = (): Promise<boolean> => {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          clearWaitTimers();
          resolve(value);
        };

        if (window.miro?.board) {
          finish(true);
          return;
        }

        waitInterval = setInterval(() => {
          if (window.miro?.board) {
            finish(true);
          }
        }, MIRO_BOOT_POLL_MS);

        waitTimeout = setTimeout(() => {
          finish(false);
        }, MIRO_BOOT_WAIT_MS);
      });
    };

    const loadTokens = async (showLoading: boolean): Promise<void> => {
      if (!active) return;
      if (showLoading) {
        setTokensLoading(true);
      }

      await waitForMiro();
      if (!active) return;

      let fToken: string | null = null;
      let mToken: string | null = null;

      try {
        fToken = await getValidToken('figma');
        mToken = await getValidToken('miro');

        if (!active) return;
        setFigmaToken(fToken);
        setMiroToken(mToken);
      } catch (err) {
        console.error('Failed to load credentials:', err);
      } finally {
        if (active) {
          setTokensLoading(false);
        }
      }

      if (!active) return;

      if (fToken || mToken) {
        retryCount = 0;
        return;
      }

      if (retryCount >= MAX_BOOT_RETRIES) {
        return;
      }

      retryCount += 1;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      retryTimeout = setTimeout(() => {
        if (!active) return;
        // Background retries should not force perpetual yellow UI.
        void loadTokens(false);
      }, BOOT_RETRY_DELAY_MS);
    };

    // Initial boot run shows loading state.
    void loadTokens(true);

    return () => {
      active = false;
      clearWaitTimers();
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, []);

  useEffect(() => {
    if (isInitMode !== false) return;

    const syncChannel = new BroadcastChannel('figma_miro_sync');
    const oauthChannel = new BroadcastChannel('oauth_callback');

    syncChannel.onmessage = (event: MessageEvent) => {
      const payload = event.data as unknown;
      if (!payload || typeof payload !== 'object') return;

      const obj = payload as Record<string, unknown>;
      if (obj.type !== 'TOKENS_UPDATED' || !obj.tokenData || typeof obj.tokenData !== 'object') {
        return;
      }

      const tokenData = obj.tokenData as Record<string, unknown>;
      if (tokenData.figmaToken === null || typeof tokenData.figmaToken === 'string') {
        setFigmaToken(tokenData.figmaToken ?? null);
      }
      if (tokenData.miroToken === null || typeof tokenData.miroToken === 'string') {
        setMiroToken(tokenData.miroToken ?? null);
      }
      setTokensLoading(false);
    };

    const applyAuthSuccess = async (platform: 'figma' | 'miro', rawTokens: unknown) => {
      const normalized = normalizeTokenData(rawTokens);
      if (!normalized) return;

      if (platform === 'figma') {
        setFigmaToken(normalized.accessToken);
        await saveToken('figma', normalized);
      } else {
        setMiroToken(normalized.accessToken);
        await saveToken('miro', normalized);
      }

      setTokensLoading(false);
    };

    oauthChannel.onmessage = async (event: MessageEvent) => {
      const payload = event.data as unknown;
      if (!payload || typeof payload !== 'object') return;

      const obj = payload as Record<string, unknown>;
      const type = typeof obj.type === 'string' ? obj.type : '';

      if (type === 'FIGMA_AUTH_SUCCESS') {
        await applyAuthSuccess('figma', obj.tokens);
      }
      if (type === 'MIRO_AUTH_SUCCESS') {
        await applyAuthSuccess('miro', obj.tokens);
      }
    };

    // Listen to postMessage from popup directly (bypasses BroadcastChannel partitioning edge cases)
    const handlePopupMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const payload = event.data as unknown;
      if (!payload || typeof payload !== 'object') return;

      const obj = payload as Record<string, unknown>;
      const type = typeof obj.type === 'string' ? obj.type : '';

      if (type === 'FIGMA_AUTH_SUCCESS') {
        await applyAuthSuccess('figma', obj.tokens);
      }
      if (type === 'MIRO_AUTH_SUCCESS') {
        await applyAuthSuccess('miro', obj.tokens);
      }
    };

    window.addEventListener('message', handlePopupMessage);

    return () => {
      syncChannel.close();
      oauthChannel.close();
      window.removeEventListener('message', handlePopupMessage);
    };
  }, [isInitMode]);

  const startPolling = (platform: 'figma' | 'miro', state: string, popup: Window | null) => {
    const interval = setInterval(async () => {
      // If popup was closed manually, stop polling
      if (popup && popup.closed) {
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetch(`/api/oauth/store?state=${state}`, {
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;

        const rawData: unknown = await res.json();
        if (!rawData || typeof rawData !== 'object') return;

        const data = rawData as Record<string, unknown>;
        const status = typeof data.status === 'string' ? data.status : '';
        if (status !== 'success') return;
        const normalizedTokens = normalizeTokenData(data.tokens);
        if (!normalizedTokens) return;

        clearInterval(interval);

        if (platform === 'figma') {
          setFigmaToken(normalizedTokens.accessToken);
          await saveToken('figma', normalizedTokens);
        } else {
          setMiroToken(normalizedTokens.accessToken);
          await saveToken('miro', normalizedTokens);
        }

        setTokensLoading(false);

        if (popup) {
          try {
            popup.close();
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.error(`Error polling for ${platform} tokens:`, err);
      }
    }, 1500);

    // Stop polling after 5 minutes to prevent infinite loops
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
  };

  const connectFigma = () => {
    const state = generateSecureState('fig');
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      `/api/oauth/figma/auth?state=${state}`,
      'Connect Figma',
      `width=${width},height=${height},top=${top},left=${left}`
    );

    startPolling('figma', state, popup);
  };

  const connectMiro = () => {
    const state = generateSecureState('mir');
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      `/api/oauth/miro/auth?state=${state}`,
      'Connect Miro',
      `width=${width},height=${height},top=${top},left=${left}`
    );

    startPolling('miro', state, popup);
  };

  const disconnectFigma = async () => {
    try {
      await clearToken('figma');
      setFigmaToken(null);

      // Broadcast update to other tabs
      const syncChannel = new BroadcastChannel('figma_miro_sync');
      syncChannel.postMessage({ type: 'TOKENS_UPDATED', tokenData: { figmaToken: null } });
      syncChannel.close();
    } catch (e) {
      console.error('Failed to disconnect Figma:', e);
    }
  };

  const disconnectMiro = async () => {
    try {
      await clearToken('miro');
      setMiroToken(null);

      // Broadcast update to other tabs
      const syncChannel = new BroadcastChannel('figma_miro_sync');
      syncChannel.postMessage({ type: 'TOKENS_UPDATED', tokenData: { miroToken: null } });
      syncChannel.close();
    } catch (e) {
      console.error('Failed to disconnect Miro:', e);
    }
  };

  return {
    figmaToken,
    miroToken,
    connectFigma,
    connectMiro,
    disconnectFigma,
    disconnectMiro,
    setFigmaToken,
    setMiroToken,
    tokensLoading,
  };
}
