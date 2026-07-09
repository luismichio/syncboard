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
  const [isInitMode] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('init') === 'true';
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('');

  // 1. Auth Hook
  const {
    figmaToken,
    miroToken,
    connectFigma,
    connectMiro,
    disconnectFigma,
    disconnectMiro,
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
    syncAllCopies,
    setSyncAllCopies,
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
    disconnectFigma,
    disconnectMiro,
    parseFigmaLink,
    detectLocalFigmaSelection,
    importFigmaScreen,
    syncSelectedScreens,
    syncAllCopies,
    setSyncAllCopies,
  };
}
