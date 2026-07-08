import { useEffect, useState } from 'react';
import { useAuthTokens } from './useAuthTokens';
import { useMiroSelection } from './useMiroSelection';
import { useFigmaImporter } from './useFigmaImporter';
import { useMiroSync } from './useMiroSync';

/**
 * Main coordinator hook for the Miro sidebar panel app.
 * Integrates single-responsibility sub-hooks to provide a unified API.
 */
export function useMiroPlugin() {
  const [isInitMode, setIsInitMode] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('');

  // Calculate headless/panel mode once on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setIsInitMode(params.get('init') === 'true');
  }, []);

  // 1. Auth Hook
  const {
    figmaToken,
    miroToken,
    connectFigma,
    connectMiro,
  } = useAuthTokens(isInitMode);

  // 2. Selection Hook
  const {
    selectedItems,
  } = useMiroSelection(isInitMode);

  // 3. Figma Importer Hook
  const {
    figmaInput,
    figmaNodeInfo,
    isDetectingLocal,
    parseFigmaLink,
    detectLocalFigmaSelection,
    importFigmaScreen,
  } = useFigmaImporter(figmaToken, setIsSyncing, setSyncStatus);

  // 4. Board Sync Hook
  const {
    syncSelectedScreens,
  } = useMiroSync(
    figmaToken,
    miroToken,
    selectedItems,
    isSyncing,
    setIsSyncing,
    setSyncStatus
  );

  return {
    isInitMode,
    figmaToken,
    miroToken,
    selectedItems,
    isSyncing,
    syncStatus,
    figmaInput,
    figmaNodeInfo,
    isDetectingLocal,
    connectFigma,
    connectMiro,
    parseFigmaLink,
    detectLocalFigmaSelection,
    importFigmaScreen,
    syncSelectedScreens,
  };
}
