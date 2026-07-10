import { useState } from 'react';
import { SyncedImage } from './useMiroSelection';
import { callPenpotMcpTool } from './penpotMcpClient';

/**
 * Handles board sync with support for both Figma and Penpot:
 * - Default: update only the exact selected widget(s)
 * - syncAllCopies: scan the entire board and update every copy sharing the same keys
 *
 * Syncing strategy:
 * - Figma: batch rendered via the /api/figma/render-batch cloud endpoint.
 * - Penpot: fetched locally in parallel via the local Penpot MCP server.
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
    if (selectedItems.length === 0 || !miroToken) return;
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
        platform?: 'figma' | 'penpot';
      };

      let itemsToSync: SyncTarget[] = [];

      if (syncAllCopies) {
        const allItems = await miro.board.get();
        for (const selected of selectedItems) {
          const matches = allItems.filter(item => {
            if (item.type === 'image' && item.title) {
              const tag = selected.platform === 'penpot' ? 'PenpotSync' : 'SyncBoard';
              const regex = new RegExp(`\\[${tag}\\|([^|]+)\\|([^\\]]+)\\]`);
              const match = item.title.match(regex);
              return match && match[1] === selected.fileKey && match[2] === selected.nodeId;
            }
            return false;
          });

          for (const match of matches) {
            let format: 'png' | 'svg' = selected.format || (selected.platform === 'penpot' ? 'svg' : 'png');
            let scale = selected.scale || 2;
            let platform = selected.platform || 'figma';

            try {
              const metadata = (await match.getMetadata()) as Record<string, unknown> | undefined;
              const syncData = metadata?.syncboard as { 
                format?: 'png' | 'svg'; 
                scale?: number;
                platform?: 'figma' | 'penpot';
              } | undefined;
              if (syncData) {
                format = syncData.format || (syncData.platform === 'penpot' ? 'svg' : 'png');
                scale = syncData.scale || 2;
                platform = syncData.platform || 'figma';
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
              platform,
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
          platform: s.platform || 'figma',
        }));
      }

      if (itemsToSync.length === 0) {
        setSyncStatus('No items to sync.');
        setIsSyncing(false);
        return;
      }

      // renderCache: "fileKey|nodeId" -> base64 data URL
      const renderCache = new Map<string, string>();

      // Partition into Figma and Penpot targets
      const figmaTargets = itemsToSync.filter(t => t.platform !== 'penpot');
      const penpotTargets = itemsToSync.filter(t => t.platform === 'penpot');

      // --- Figma Batch Rendering ---
      if (figmaTargets.length > 0) {
        if (!figmaToken) {
          throw new Error('Figma token missing. Please connect Figma to sync Figma frames.');
        }

        // Group unique nodes by fileKey, format, and scale
        const groups = new Map<string, Set<string>>();
        for (const item of figmaTargets) {
          const format = item.format || 'png';
          const scale = item.scale || 2;
          const groupKey = `${item.fileKey}|${format}|${scale}`;
          if (!groups.has(groupKey)) {
            groups.set(groupKey, new Set());
          }
          groups.get(groupKey)!.add(item.nodeId);
        }

        const totalGroups = groups.size;
        let groupIndex = 0;

        for (const [groupKey, nodeIdSet] of groups) {
          groupIndex++;
          const [fileKey, format, scaleStr] = groupKey.split('|');
          const scale = Number(scaleStr);
          const nodeIds = [...nodeIdSet];

          setSyncStatus(`Fetching Figma group ${groupIndex}/${totalGroups}: ${nodeIds.length} frame(s)...`);

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
      }

      // --- Penpot Batch Rendering ---
      if (penpotTargets.length > 0) {
        setSyncStatus(`Requesting ${penpotTargets.length} frame(s) from Penpot MCP server...`);
        
        await Promise.all(
          penpotTargets.map(async (target) => {
            const format = target.format || 'svg';
            try {
              const mcpResponse = await callPenpotMcpTool('export_shape', {
                shapeId: target.nodeId,
                format: format,
              });

              if (mcpResponse.content && mcpResponse.content.length > 0) {
                const content = mcpResponse.content[0];
                if (format === 'svg' && content.text) {
                  // Convert SVG string to base64 Data URL to keep Miro updates unified
                  const base64 = btoa(unescape(encodeURIComponent(content.text)));
                  const dataUrl = `data:image/svg+xml;base64,${base64}`;
                  renderCache.set(`${target.fileKey}|${target.nodeId}`, dataUrl);
                } else if (format === 'png' && content.data) {
                  // PNG base64 representation
                  const dataUrl = `data:image/png;base64,${content.data}`;
                  renderCache.set(`${target.fileKey}|${target.nodeId}`, dataUrl);
                }
              } else {
                throw new Error('Penpot MCP returned an empty payload.');
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`Penpot export failed for node ${target.nodeId}:`, err);
              throw new Error(`Penpot sync failed for '${target.nodeName}': ${msg}. Make sure Penpot is open, the file is connected to the local MCP, and the server is running on port 4401.`);
            }
          })
        );
      }

      // --- STEP 2: Update each board widget using the cached data URLs ---
      for (let i = 0; i < itemsToSync.length; i++) {
        const item = itemsToSync[i];
        const dataUrl = renderCache.get(`${item.fileKey}|${item.nodeId}`);
        if (!dataUrl) {
          console.warn(`No render cached for ${item.fileKey}|${item.nodeId}, skipping.`);
          continue;
        }

        if (i > 0) await new Promise(resolve => setTimeout(resolve, 500));
        setSyncStatus(`Updating canvas widget ${i + 1}/${itemsToSync.length}: ${item.nodeName}`);

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
            format: item.format || (item.platform === 'penpot' ? 'svg' : 'png'),
            scale: item.scale || 2,
            platform: item.platform || 'figma',
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to update image on Miro board');
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
