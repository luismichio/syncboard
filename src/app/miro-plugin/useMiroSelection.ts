import { useEffect, useState } from 'react';

export interface SyncedImage {
  id: string;
  title: string;
  fileKey: string;
  nodeId: string;
  nodeName: string;
}

/**
 * Manages the global window.miro SDK registration, selection:update listeners,
 * and releases listeners cleanly on unmount to prevent duplicate triggers.
 */
export function useMiroSelection(isInitMode: boolean | null) {
  const [selectedItems, setSelectedItems] = useState<SyncedImage[]>([]);

  useEffect(() => {
    if (isInitMode === null) return;
    if (typeof window === 'undefined') return;

    let active = true;
    let interval: NodeJS.Timeout;
    let savedMiro: { board: MiroBoard } | null = null;
    let savedHandler: ((event: unknown) => void) | null = null;

    const initMiro = async () => {
      const waitForMiro = (): Promise<{ board: MiroBoard }> => {
        return new Promise((resolve) => {
          if (window.miro?.board) {
            resolve({ board: window.miro.board });
            return;
          }
          interval = setInterval(() => {
            if (window.miro?.board) {
              clearInterval(interval);
              resolve({ board: window.miro.board });
            }
          }, 50);
        });
      };

      const miro = await waitForMiro();
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

            for (const item of selection) {
              if (item.type === 'image') {
                // 1. Try title-based parsing first (synchronous, 0ms latency, zero API rate limits)
                if (item.title) {
                  const match = item.title.match(/^(.*?)\s*\[SyncBoard\|([^|]+)\|([^\]]+)\]$/);
                  if (match) {
                    synced.push({
                      id: item.id,
                      title: item.title,
                      fileKey: match[2],
                      nodeId: match[3],
                      nodeName: match[1].trim() || 'Unnamed Screen',
                    });
                    continue; // Skip metadata query!
                  }
                }

                // 2. Fallback to metadata query (async, only if title is empty or lacks sync tag)
                try {
                  const metadata = (await item.getMetadata()) as Record<string, unknown> | undefined;
                  const syncData = metadata?.syncboard as { fileKey?: string; nodeId?: string; nodeName?: string } | undefined;
                  if (syncData?.fileKey && syncData?.nodeId) {
                    synced.push({
                      id: item.id,
                      title: `${syncData.nodeName || 'Unnamed Screen'} [SyncBoard|${syncData.fileKey}|${syncData.nodeId}]`,
                      fileKey: syncData.fileKey,
                      nodeId: syncData.nodeId,
                      nodeName: syncData.nodeName || 'Unnamed Screen',
                    });
                  }
                } catch (metaErr) {
                  console.error("Failed to read metadata for item:", item.id, metaErr);
                }
              }
            }

            if (!active) return;
            setSelectedItems(synced);

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
      if (interval) clearInterval(interval);
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
  };
}
