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
    console.log("SyncBoard: useMiroSelection useEffect firing. isInitMode:", isInitMode);
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
            resolve(window.miro);
            return;
          }
          interval = setInterval(() => {
            if (window.miro?.board) {
              clearInterval(interval);
              resolve(window.miro);
            }
          }, 50);
        });
      };

      console.log("SyncBoard: Polling for window.miro.board...");
      const miro = await waitForMiro();
      console.log("SyncBoard: window.miro.board resolved successfully!");
      savedMiro = miro;
      if (!active) return;

      if (isInitMode === true) {
        // Headless Initial mode: Register Toolbar Click
        miro.board.ui.on('icon:click', async () => {
          await miro.board.ui.openPanel({
            url: '/miro-plugin',
          });
        });
        console.log('SyncBoard Headless Iframe Initialized.');
      } else {
        // Panel Mode: Bind Selection Listeners
        const handleSelection = async () => {
          try {
            const selection = await miro.board.getSelection();
            console.log("SyncBoard Selection Event. Total items:", selection.length);
            const synced: SyncedImage[] = [];

            for (const item of selection) {
              console.log("Inspecting selected item ID:", item.id, "Type:", item.type);
              if (item.type === 'image') {
                // 1. Try title-based parsing first (synchronous, 0ms latency, zero API rate limits)
                if (item.title) {
                  const match = item.title.match(/^\[SyncBoard\|([^|]+)\|([^\]]+)\]\s*(.*)$/);
                  if (match) {
                    console.log("SyncBoard title match found! FileKey:", match[1], "NodeID:", match[2]);
                    synced.push({
                      id: item.id,
                      title: item.title,
                      fileKey: match[1],
                      nodeId: match[2],
                      nodeName: match[3] || 'Unnamed Screen',
                    });
                    continue; // Skip metadata query!
                  }
                }

                // 2. Fallback to metadata query (async, only if title is empty or lacks sync tag)
                try {
                  const metadata = (await item.getMetadata()) as Record<string, unknown> | undefined;
                  const syncData = metadata?.syncboard as { fileKey?: string; nodeId?: string; nodeName?: string } | undefined;
                  
                  if (syncData?.fileKey && syncData?.nodeId) {
                    console.log("SyncBoard metadata fallback match found! FileKey:", syncData.fileKey, "NodeID:", syncData.nodeId);
                    synced.push({
                      id: item.id,
                      title: `[SyncBoard|${syncData.fileKey}|${syncData.nodeId}] ${syncData.nodeName || 'Unnamed Screen'}`,
                      fileKey: syncData.fileKey,
                      nodeId: syncData.nodeId,
                      nodeName: syncData.nodeName || 'Unnamed Screen',
                    });
                  } else {
                    console.log("Item lacks SyncBoard title pattern and metadata");
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

        console.log("SyncBoard: Querying initial selection on mount...");
        await handleSelection();

        console.log("SyncBoard: Registering selection:update listener...");
        miro.board.ui.on('selection:update', handleSelection);
      }
    };

    initMiro();

    return () => {
      console.log("SyncBoard: useMiroSelection cleanup hook run.");
      active = false;
      if (interval) clearInterval(interval);
      if (savedMiro && savedHandler) {
        try {
          console.log("SyncBoard: Removing selection:update event listener.");
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
