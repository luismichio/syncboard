import { useState } from 'react';
import { SyncedImage } from './useMiroSelection';

/**
 * Handles board sync with two modes:
 * - Default: update only the exact selected widget(s)
 * - syncAllCopies: scan the entire board and update every copy sharing the same fileKey+nodeId
 *
 * Figma API batching strategy:
 * - Items are grouped by fileKey, format, and scale to allow mixed sync selections
 * - A SINGLE Figma API call is made per group with ALL node IDs comma-separated
 * - Cached images are reused for matching board widgets during updates
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
    try {
      const boardInfo = await miro.board.getInfo();
      const boardId = boardInfo.id;

      type SyncTarget = { 
        id: string; 
        fileKey: string; 
        nodeId: string; 
        nodeName: string; 
        width?: number;
        format?: 'png' | 'svg';
        scale?: number;
      };

      let itemsToSync: SyncTarget[] = [];

      if (syncAllCopies) {
        const allItems = await miro.board.get();
        for (const selected of selectedItems) {
          const matches = allItems.filter(item => {
            if (item.type === 'image' && item.title) {
              const match = item.title.match(/\[SyncBoard\|([^|]+)\|([^\]]+)\]/);
              return match && match[1] === selected.fileKey && match[2] === selected.nodeId;
            }
            return false;
          });

          for (const match of matches) {
            // Retrieve copies format/scale properties from their board metadata
            let format: 'png' | 'svg' = selected.format || 'png';
            let scale = selected.scale || 2;
            try {
              const metadata = (await match.getMetadata()) as Record<string, unknown> | undefined;
              const syncData = metadata?.syncboard as { format?: 'png' | 'svg'; scale?: number } | undefined;
              if (syncData) {
                format = syncData.format || 'png';
                scale = syncData.scale || 2;
              }
            } catch (err) {
              console.error("Failed to read copy metadata:", match.id, err);
            }

            itemsToSync.push({
              id: match.id,
              fileKey: selected.fileKey,
              nodeId: selected.nodeId,
              nodeName: selected.nodeName,
              width: match.width,
              format,
              scale,
            });
          }
        }
      } else {
        itemsToSync = selectedItems.map(s => ({
          id: s.id,
          fileKey: s.fileKey,
          nodeId: s.nodeId,
          nodeName: s.nodeName,
          format: s.format,
          scale: s.scale,
        }));
      }

      if (itemsToSync.length === 0) {
        setSyncStatus('No items to sync.');
        setIsSyncing(false);
        return;
      }

      // --- STEP 1: Batch Figma renders — group unique nodes by fileKey, format, and scale ---
      // This ensures optimal Figma API batching while handling mixed rendering specifications.
      // groupKey: "fileKey|format|scale" -> Set of nodeIds
      const groups = new Map<string, Set<string>>();
      for (const item of itemsToSync) {
        const format = item.format || 'png';
        const scale = item.scale || 2;
        const groupKey = `${item.fileKey}|${format}|${scale}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, new Set());
        }
        groups.get(groupKey)!.add(item.nodeId);
      }

      const totalGroups = groups.size;
      // renderCache: "fileKey|nodeId" -> base64 data URL
      const renderCache = new Map<string, string>();
      let groupIndex = 0;

      for (const [groupKey, nodeIdSet] of groups) {
        groupIndex++;
        const [fileKey, format, scaleStr] = groupKey.split('|');
        const scale = Number(scaleStr);
        const nodeIds = [...nodeIdSet];

        setSyncStatus(`Fetching group ${groupIndex}/${totalGroups}: ${nodeIds.length} frame(s) (${format.toUpperCase()} ${format === 'png' ? scale + 'x' : ''})...`);

        const batchRes = await fetch('/api/figma/render-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ figmaToken, fileKey, nodeIds, format, scale }),
        });

        if (!batchRes.ok) {
          const errData = await batchRes.json().catch(() => ({})) as {
            error?: string;
            retryAfter?: number | null;
            planTier?: string | null;
            limitType?: string | null;
          };

          if (batchRes.status === 429) {
            const parts: string[] = ['Rate limited by Figma.'];
            if (errData.planTier) parts.push(`Plan: ${errData.planTier}.`);
            if (errData.limitType) parts.push(`Seat tier: ${errData.limitType}.`);
            if (errData.retryAfter) parts.push(`Retry in ${errData.retryAfter}s.`);
            throw new Error(parts.join(' '));
          }
          throw new Error(errData.error || 'Figma batch render failed');
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
            format: item.format || 'png',
            scale: item.scale || 2,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to update image on board');
        }
      }

      const label = syncAllCopies ? 'all copies' : 'selected widget(s)';
      setSyncStatus(`✓ Updated ${itemsToSync.length} ${label} successfully!`);

      try {
        const syncChannel = new BroadcastChannel('figma_miro_sync');
        syncChannel.postMessage({ type: 'SYNC_COMPLETE' });
        syncChannel.close();
      } catch {}
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Sync failed: ${errMsg}`);
      try {
        const syncChannel = new BroadcastChannel('figma_miro_sync');
        syncChannel.postMessage({ type: 'SYNC_ERROR', error: errMsg });
        syncChannel.close();
      } catch {}
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
