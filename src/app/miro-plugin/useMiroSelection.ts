import { useEffect, useState } from 'react';

export interface SyncedImage {
  id: string;
  title: string;
  fileKey: string;
  nodeId: string;
  nodeName: string;
  width?: number;
  format?: 'png' | 'svg';
  scale?: number;
  platform?: 'figma' | 'penpot';
}

/**
 * Manages the global window.miro SDK registration, selection:update listeners,
 * and releases listeners cleanly on unmount to prevent duplicate triggers.
 * Reads image-specific format/scale preferences and platform from Miro widget metadata.
 * Also exposes isAnyImageSelected — true when any image widget (even non-SyncBoard) is selected.
 */
export function useMiroSelection(isInitMode: boolean | null) {
  const [selectedItems, setSelectedItems] = useState<SyncedImage[]>([]);
  const [isAnyImageSelected, setIsAnyImageSelected] = useState<boolean>(false);

  useEffect(() => {
    if (isInitMode === null) return;
    if (typeof window === 'undefined') return;

    let active = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let savedMiro: { board: MiroBoard } | null = null;
    let savedHandler: ((event: unknown) => void) | null = null;

    const clearBootTimers = () => {
      if (interval) { clearInterval(interval); interval = null; }
      if (timeout) { clearTimeout(timeout); timeout = null; }
    };

    const HEADLESS_SDK_TIMEOUT_MS = 20000;
    const HEADLESS_RETRY_DELAY_MS = 5000;
    const MAX_HEADLESS_RETRIES = 3;

    const initMiro = async () => {
      const waitForMiro = (timeoutMs: number): Promise<{ board: MiroBoard } | null> => {
        clearBootTimers();
        return new Promise((resolve) => {
          if (window.miro?.board) {
            resolve({ board: window.miro.board });
            return;
          }
          interval = setInterval(() => {
            if (window.miro?.board) {
              clearBootTimers();
              resolve({ board: window.miro.board });
            }
          }, 50);
          timeout = setTimeout(() => {
            clearBootTimers();
            resolve(null);
          }, timeoutMs);
        });
      };

      // Retry loop: the Miro SDK may take multiple seconds to inject
      // window.miro after the iframe loads (cold start, slow board).
      // Headless mode gets a longer timeout and retries.
      let miro: { board: MiroBoard } | null = null;
      const effectiveTimeout = isInitMode === true ? HEADLESS_SDK_TIMEOUT_MS : 8000;
      const maxAttempts = isInitMode === true ? MAX_HEADLESS_RETRIES : 1;

      for (let attempt = 0; attempt <= maxAttempts; attempt++) {
        if (!active) return;
        miro = await waitForMiro(effectiveTimeout);
        if (miro) break;
        if (attempt < maxAttempts) {
          await new Promise(r => { const t = setTimeout(r, HEADLESS_RETRY_DELAY_MS); if (!active) clearTimeout(t); });
        }
      }

      if (!miro) {
        console.warn('[MiroSelection] Miro SDK did not load after retries — giving up');
        return;
      }
      savedMiro = miro;

      if (!active) return;

      if (isInitMode === true) {
        // Headless Initial mode: Register Toolbar Click
        miro.board.ui.on('icon:click', async () => {
          await miro.board.ui.openPanel({
            url: '/miro-plugin',
          });
        });
      } else {
        // Panel Mode: Bind Selection Listeners
        const handleSelection = async () => {
          try {
            const selection = await miro.board.getSelection();
            const synced: SyncedImage[] = [];
            const hasAnyImage = selection.some(item => item.type === 'image');

            for (const item of selection) {
              if (item.type === 'image') {
                // 1. Try title-based parsing first
                if (item.title) {
                  const figmaMatch = item.title.match(/^(.*?)\s*\[SyncBoard\|([^|]+)\|([^\]]+)\]$/);
                  const penpotMatch = item.title.match(/^(.*?)\s*\[PenpotSync\|([^|]+)\|([^\]]+)\]$/);

                  if (figmaMatch) {
                    let format: 'png' | 'svg' = 'png';
                    let scale = 1;
                    try {
                      const metadata = (await item.getMetadata()) as Record<string, unknown> | undefined;
                      const syncData = metadata?.syncboard as { format?: 'png' | 'svg'; scale?: number } | undefined;
                      if (syncData) {
                        format = syncData.format || 'png';
                        scale = syncData.scale || 1;
                      }
                    } catch (metaErr) {
                      console.error("Failed to read metadata for item:", item.id, metaErr);
                    }
                    synced.push({
                      id: item.id,
                      title: item.title,
                      fileKey: figmaMatch[2],
                      nodeId: figmaMatch[3],
                      nodeName: figmaMatch[1].trim() || 'Unnamed Screen',
                      width: item.width,
                      format,
                      scale,
                      platform: 'figma',
                    });
                    continue;
                  } else if (penpotMatch) {
                    let format: 'png' | 'svg' = 'svg';
                    let scale = 1;
                    try {
                      const metadata = (await item.getMetadata()) as Record<string, unknown> | undefined;
                      const syncData = metadata?.syncboard as { format?: 'png' | 'svg'; scale?: number } | undefined;
                      if (syncData) {
                        format = syncData.format || 'svg';
                        scale = syncData.scale || 1;
                      }
                    } catch (metaErr) {
                      console.error("Failed to read metadata for item:", item.id, metaErr);
                    }
                    synced.push({
                      id: item.id,
                      title: item.title,
                      fileKey: penpotMatch[2],
                      nodeId: penpotMatch[3],
                      nodeName: penpotMatch[1].trim() || 'Unnamed Screen',
                      width: item.width,
                      format,
                      scale,
                      platform: 'penpot',
                    });
                    continue;
                  }
                }

                // 2. Fallback to metadata query (if title is empty or modified)
                try {
                  const metadata = (await item.getMetadata()) as Record<string, unknown> | undefined;
                  const syncData = metadata?.syncboard as {
                    fileKey?: string;
                    nodeId?: string;
                    nodeName?: string;
                    format?: 'png' | 'svg';
                    scale?: number;
                    platform?: 'figma' | 'penpot';
                  } | undefined;
                  if (syncData?.fileKey && syncData?.nodeId) {
                    const platform = syncData.platform || 'figma';
                    const tag = platform === 'penpot' ? 'PenpotSync' : 'SyncBoard';
                    synced.push({
                      id: item.id,
                      title: `${syncData.nodeName || 'Unnamed Screen'} [${tag}|${syncData.fileKey}|${syncData.nodeId}]`,
                      fileKey: syncData.fileKey,
                      nodeId: syncData.nodeId,
                      nodeName: syncData.nodeName || 'Unnamed Screen',
                      width: item.width,
                      format: syncData.format || (platform === 'penpot' ? 'svg' : 'png'),
                      scale: syncData.scale || 2,
                      platform,
                    });
                  }
                } catch (metaErr) {
                  console.error("Failed to read metadata for item:", item.id, metaErr);
                }
              }
            }

            if (!active) return;
            setSelectedItems(synced);
            setIsAnyImageSelected(hasAnyImage);

            // Broadcast selection updates to the external dashboard tab
            try {
              const syncChannel = new BroadcastChannel('figma_miro_sync');
              syncChannel.postMessage({ type: 'SELECTION_CHANGED', selection: synced });
              syncChannel.close();
            } catch (e) {
              console.error('Failed to broadcast selection:', e);
            }
          } catch (err) {
            console.error('Failed to get selection:', err);
          }
        };

        savedHandler = handleSelection;
        await handleSelection();
        miro.board.ui.on('selection:update', handleSelection);
      }
    };

    initMiro();

    return () => {
      active = false;
      clearBootTimers();
      if (savedMiro && savedHandler) {
        try {
          savedMiro.board.ui.off('selection:update', savedHandler);
        } catch (e) {
          console.warn('Failed to unsubscribe from selection changes:', e);
        }
      }
    };
  }, [isInitMode]);

  return {
    selectedItems,
    setSelectedItems,
    isAnyImageSelected,
  };
}
