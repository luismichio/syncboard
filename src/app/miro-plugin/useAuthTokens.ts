import { useEffect, useState } from 'react';
import { getValidToken, clearToken, TokenData } from '@/lib/tokens';

/**
 * Handles loading, updating, and synchronizing auth tokens across tabs.
 */
export function useAuthTokens(isInitMode: boolean | null) {
  const [figmaToken, setFigmaToken] = useState<string | null>(null);
  const [miroToken, setMiroToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadTokens = async () => {
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

      oauthChannel.onmessage = (event: MessageEvent) => {
        const { type, tokens } = event.data;
        if (type === 'FIGMA_AUTH_SUCCESS' && tokens?.accessToken) {
          setFigmaToken(tokens.accessToken);
        }
        if (type === 'MIRO_AUTH_SUCCESS' && tokens?.accessToken) {
          setMiroToken(tokens.accessToken);
        }
      };

      return () => {
        syncChannel.close();
        oauthChannel.close();
      };
    }
  }, [isInitMode]);

  const connectFigma = () => {
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      '/api/oauth/figma/auth',
      'Connect Figma',
      `width=${width},height=${height},top=${top},left=${left}`
    );
  };

  const connectMiro = () => {
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      '/api/oauth/miro/auth',
      'Connect Miro',
      `width=${width},height=${height},top=${top},left=${left}`
    );
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
