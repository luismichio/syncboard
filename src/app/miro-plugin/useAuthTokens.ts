import { useEffect, useState } from 'react';
import { getValidToken, clearToken, saveToken, TokenData } from '@/lib/tokens';

/**
 * Handles loading, updating, and synchronizing auth tokens across tabs.
 * Waits for Miro SDK initialisation to ensure board storage is available on mount.
 */
export function useAuthTokens(isInitMode: boolean | null) {
  const [figmaToken, setFigmaToken] = useState<string | null>(null);
  const [miroToken, setMiroToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;
    let interval: NodeJS.Timeout;

    const loadTokens = async () => {
      // Wait for Miro board storage bridge to initialize before fetching tokens
      const waitForMiro = (): Promise<boolean> => {
        return new Promise((resolve) => {
          if (window.miro?.board) {
            resolve(true);
            return;
          }
          interval = setInterval(() => {
            if (window.miro?.board) {
              clearInterval(interval);
              resolve(true);
            }
          }, 50);
        });
      };

      await waitForMiro();
      if (!active) return;

      try {
        const fToken = await getValidToken('figma');
        const mToken = await getValidToken('miro');
        setFigmaToken(fToken);
        setMiroToken(mToken);
      } catch (err) {
        console.error('Failed to load credentials:', err);
      }
    };

    loadTokens();

    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (isInitMode === false) {
      const syncChannel = new BroadcastChannel('figma_miro_sync');
      const oauthChannel = new BroadcastChannel('oauth_callback');
      
      syncChannel.onmessage = (event: MessageEvent) => {
        const { type, tokenData } = event.data;
        if (type === 'TOKENS_UPDATED' && tokenData) {
          const typedData = tokenData as { figmaToken?: string | null; miroToken?: string | null };
          if (typedData.figmaToken !== undefined) setFigmaToken(typedData.figmaToken);
          if (typedData.miroToken !== undefined) setMiroToken(typedData.miroToken);
        }
      };

      oauthChannel.onmessage = async (event: MessageEvent) => {
        const { type, tokens } = event.data;
        if (type === 'FIGMA_AUTH_SUCCESS' && tokens?.accessToken) {
          setFigmaToken(tokens.accessToken);
          await saveToken('figma', tokens as TokenData);
        }
        if (type === 'MIRO_AUTH_SUCCESS' && tokens?.accessToken) {
          setMiroToken(tokens.accessToken);
          await saveToken('miro', tokens as TokenData);
        }
      };

      // Listen to postMessage from the popup window directly (bypasses iframe BroadcastChannel partitioning)
      const handlePopupMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const { type, tokens } = event.data || {};
        if (type === 'FIGMA_AUTH_SUCCESS' && tokens?.accessToken) {
          setFigmaToken(tokens.accessToken);
          await saveToken('figma', tokens as TokenData);
        }
        if (type === 'MIRO_AUTH_SUCCESS' && tokens?.accessToken) {
          setMiroToken(tokens.accessToken);
          await saveToken('miro', tokens as TokenData);
        }
      };

      window.addEventListener('message', handlePopupMessage);

      return () => {
        syncChannel.close();
        oauthChannel.close();
        window.removeEventListener('message', handlePopupMessage);
      };
    }
  }, [isInitMode]);

  const startPolling = (platform: 'figma' | 'miro', state: string, popup: Window | null) => {
    const interval = setInterval(async () => {
      // If popup was closed manually, stop polling
      if (popup && popup.closed) {
        clearInterval(interval);
        return;
      }
      
      try {
        const res = await fetch(`/api/oauth/store?state=${state}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.status === 'success' && data.tokens) {
          clearInterval(interval);
          if (platform === 'figma') {
            setFigmaToken(data.tokens.accessToken);
            await saveToken('figma', data.tokens as TokenData);
          } else {
            setMiroToken(data.tokens.accessToken);
            await saveToken('miro', data.tokens as TokenData);
          }
          if (popup) {
            try {
              popup.close();
            } catch {
              // ignore
            }
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
    const state = 'fig_' + Math.random().toString(36).substring(2, 15);
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
    const state = 'mir_' + Math.random().toString(36).substring(2, 15);
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
  };
}
