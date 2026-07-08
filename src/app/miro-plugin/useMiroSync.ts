import { SyncedImage } from './useMiroSelection';

/**
 * Handles the board duplicate scanning loop and sequential (throttled)
 * sync updates to keep the board updated without triggering Miro REST API 429 limits.
 */
export function useMiroSync(
  figmaToken: string | null,
  miroToken: string | null,
  selectedItems: SyncedImage[],
  isSyncing: boolean,
  setIsSyncing: (val: boolean) => void,
  setSyncStatus: (val: string) => void
) {
  const syncSelectedScreens = async () => {
    if (isSyncing) return; // Prevent concurrent sync triggers (causes 429 rate limits)
    if (selectedItems.length === 0 || !figmaToken || !miroToken) return;
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    setIsSyncing(true);
    setSyncStatus('Scanning board for copies...');

    try {
      const boardInfo = await miro.board.getInfo();
      const boardId = boardInfo.id;

      const allItems = await miro.board.get();
      const itemsToSync: { id: string; fileKey: string; nodeId: string; nodeName: string; width?: number }[] = [];

      for (const selected of selectedItems) {
        // Find the selected item on the board as well as any duplicates/copies by title
        // Checking titles is synchronous, has 0ms latency, and issues zero board API calls.
        const matches = allItems.filter(item => {
          if (item.type === 'image' && item.title) {
            const match = item.title.match(/^\[SyncBoard\|([^|]+)\|([^\]]+)\]/);
            return match && match[1] === selected.fileKey && match[2] === selected.nodeId;
          }
          return false;
        });

        for (const match of matches) {
          itemsToSync.push({
            id: match.id,
            fileKey: selected.fileKey,
            nodeId: selected.nodeId,
            nodeName: selected.nodeName,
            width: match.width, // Preserve width of this specific copy
          });
        }
      }

      setSyncStatus(`Syncing ${itemsToSync.length} widget instance(s)...`);

      // 2. Perform the serverless sync updates for all matched instances
      for (let i = 0; i < itemsToSync.length; i++) {
        const item = itemsToSync[i];
        
        // Throttler: Wait 500ms between calls to avoid Miro REST API rate limits (429)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        setSyncStatus(`Syncing screen instance ${i + 1}/${itemsToSync.length}: ${item.nodeName}`);

        const response = await fetch('/api/miro/update-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            figmaToken,
            miroToken,
            boardId,
            itemId: item.id,
            fileKey: item.fileKey,
            nodeId: item.nodeId,
            nodeName: item.nodeName,
            width: item.width, // Pass the original width of this copy
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error || 'Failed to update image on board';
          if (response.status === 429) {
            throw new Error(`Rate limited by Figma. ${errMsg}`);
          }
          throw new Error(errMsg);
        }
      }

      setSyncStatus('All matched screens updated in-place!');

      // Broadcast sync complete status
      try {
        const syncChannel = new BroadcastChannel('figma_miro_sync');
        syncChannel.postMessage({ type: 'SYNC_COMPLETE' });
        syncChannel.close();
      } catch (e) {}
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Sync failed: ${errMsg}`);

      // Broadcast sync error status
      try {
        const syncChannel = new BroadcastChannel('figma_miro_sync');
        syncChannel.postMessage({ type: 'SYNC_ERROR', error: errMsg });
        syncChannel.close();
      } catch (e) {}
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    syncSelectedScreens,
  };
}
