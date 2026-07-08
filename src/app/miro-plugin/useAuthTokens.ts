import { useEffect, useState } from 'react';
import { getValidToken, TokenData } from '@/lib/tokens';

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
      
      syncChannel.onmessage = (event: MessageEvent) => {
        const { type, tokenData } = event.data;
        if (type === 'TOKENS_UPDATED' && tokenData) {
          const typedData = tokenData as { figmaToken?: string; miroToken?: string };
          if (typedData.figmaToken) setFigmaToken(typedData.figmaToken);
          if (typedData.miroToken) setMiroToken(typedData.miroToken);
        }
      };

      return () => syncChannel.close();
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

  return {
    figmaToken,
    miroToken,
    connectFigma,
    connectMiro,
    setFigmaToken,
    setMiroToken,
  };
}
