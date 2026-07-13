import { useEffect, useState } from 'react';
import { useAuthTokens } from './useAuthTokens';
import { useMiroSelection } from './useMiroSelection';
import { useFigmaImporter } from './useFigmaImporter';
import { usePenpotImporter } from './usePenpotImporter';
import { useMiroSync } from './useMiroSync';

/**
 * Main coordinator hook for the Miro sidebar panel app.
 * Integrates single-responsibility sub-hooks (Figma & Penpot) to provide a unified API.
 */
export function useMiroPlugin() {
  const [isInitMode, setIsInitMode] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const rafId = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      setIsInitMode(params.get('init') === 'true');
    });

    return () => window.cancelAnimationFrame(rafId);
  }, []);

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
    tokensLoading,
  } = useAuthTokens(isInitMode);

  // 2. Selection Hook
  const {
    selectedItems,
    setSelectedItems,
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

  // 4. Penpot Importer Hook
  const {
    penpotInput,
    penpotNodeInfo,
    isDetectingLocal: isDetectingPenpotLocal,
    parsePenpotLink,
    detectLocalPenpotSelection,
    importPenpotScreen,
  } = usePenpotImporter(setIsSyncing, setSyncStatus);

  // 5. Board Sync Hook
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
    tokensLoading,
    selectedItems,
    setSelectedItems,
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
    // Penpot importer
    penpotInput,
    penpotNodeInfo,
    isDetectingPenpotLocal,
    parsePenpotLink,
    detectLocalPenpotSelection,
    importPenpotScreen,
    // Sync
    syncSelectedScreens,
    syncAllCopies,
    setSyncAllCopies,
  };
}
