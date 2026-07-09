import { useState } from 'react';
import { SyncedImage } from './useMiroSelection';

/**
 * Handles board sync with two modes:
 * - Default: update only the exact selected widget(s)
 * - syncAllCopies: scan the entire board and update every copy sharing the same fileKey+nodeId
 *
 * Figma API batching strategy:
 * - Items are grouped by fileKey
 * - A SINGLE Figma API call is made per file with ALL node IDs comma-separated
 * - e.g. 5 frames from the same file = 1 Figma call (not 5)
 * - Downloaded images are cached and reused for all board copies of the same node
 */
export function useMiroSync(
  figmaToken: string | null,
  miroToken: string | null,
  selectedItems: SyncedImage[],
  isSyncing: boolean,
  setIsSyncing: (val: boolean) => void,
  setSyncStatus: (val: string) => void
) {
  const [syncAllCopies, setSyncAllCopies] = useState<boolean>(false);

  const syncSelectedScreens = async () => {
    if (isSyncing) return;
    if (selectedItems.length === 0 || !figmaToken || !miroToken) return;
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    setIsSyncing(true);
    setSyncStatus('Preparing sync...');

    try {
      const boardInfo = await miro.board.getInfo();
      const boardId = boardInfo.id;

      type SyncTarget = { id: string; fileKey: string; nodeId: string; nodeName: string; width?: number };
      let itemsToSync: SyncTarget[] = [];

      if (syncAllCopies) {
        setSyncStatus('Scanning board for all copies...');
        const allItems = await miro.board.get();
        for (const selected of selectedItems) {
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
              width: match.width,
            });
          }
        }
      } else {
        itemsToSync = selectedItems.map(s => ({
          id: s.id,
          fileKey: s.fileKey,
          nodeId: s.nodeId,
          nodeName: s.nodeName,
        }));
      }

      if (itemsToSync.length === 0) {
        setSyncStatus('No items to sync.');
        setIsSyncing(false);
        return;
      }

      // --- STEP 1: Batch Figma renders — group unique nodes by fileKey ---
      // This ensures ONE Figma API call per file regardless of frames or copies selected.
      const fileGroups = new Map<string, Set<string>>();
      for (const item of itemsToSync) {
        if (!fileGroups.has(item.fileKey)) {
          fileGroups.set(item.fileKey, new Set());
        }
        fileGroups.get(item.fileKey)!.add(item.nodeId);
      }

      const totalFiles = fileGroups.size;
      const totalNodes = [...fileGroups.values()].reduce((sum, s) => sum + s.size, 0);
      setSyncStatus(`Fetching ${totalNodes} frame(s) from ${totalFiles} file(s) in ${totalFiles} API call(s)...`);

      // renderCache: "fileKey|nodeId" -> base64 data URL
      const renderCache = new Map<string, string>();

      let fileIndex = 0;
      for (const [fileKey, nodeIdSet] of fileGroups) {
        fileIndex++;
        const nodeIds = [...nodeIdSet];
        setSyncStatus(`Fetching file ${fileIndex}/${totalFiles}: ${nodeIds.length} frame(s)...`);

        const batchRes = await fetch('/api/figma/render-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ figmaToken, fileKey, nodeIds }),
        });

        if (!batchRes.ok) {
          const errData = await batchRes.json().catch(() => ({}));
          const errMsg = errData.error || 'Figma batch render failed';
          if (batchRes.status === 429) throw new Error(`Rate limited by Figma. ${errMsg}`);
          throw new Error(errMsg);
        }

        const { images } = await batchRes.json() as { images: Record<string, string | null> };

        for (const nodeId of nodeIds) {
          const dataUrl = images[nodeId];
          if (dataUrl) {
            renderCache.set(`${fileKey}|${nodeId}`, dataUrl);
          }
        }
      }

      // --- STEP 2: Update each board widget using the cached data URLs ---
      setSyncStatus(`Updating ${itemsToSync.length} widget(s) on board...`);

      for (let i = 0; i < itemsToSync.length; i++) {
        const item = itemsToSync[i];
        const dataUrl = renderCache.get(`${item.fileKey}|${item.nodeId}`);
        if (!dataUrl) {
          console.warn(`No render cached for ${item.fileKey}|${item.nodeId}, skipping.`);
          continue;
        }

        // 500ms throttle between Miro PATCH calls to avoid Miro REST 429
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 500));

        setSyncStatus(`Updating widget ${i + 1}/${itemsToSync.length}: ${item.nodeName}`);

        const response = await fetch('/api/miro/update-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            miroToken,
            boardId,
            itemId: item.id,
            fileKey: item.fileKey,
            nodeId: item.nodeId,
            nodeName: item.nodeName,
            width: item.width,
            dataUrl,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to update image on board');
        }
      }

      const label = syncAllCopies ? 'all copies' : 'selected widget(s)';
      setSyncStatus(`✓ Updated ${itemsToSync.length} ${label} with ${totalFiles} Figma API call(s)!`);

      try {
        const syncChannel = new BroadcastChannel('figma_miro_sync');
        syncChannel.postMessage({ type: 'SYNC_COMPLETE' });
        syncChannel.close();
      } catch (e) {}
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Sync failed: ${errMsg}`);
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
    syncAllCopies,
    setSyncAllCopies,
    syncSelectedScreens,
  };
}
