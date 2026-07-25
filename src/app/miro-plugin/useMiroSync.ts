import { useState } from 'react';
import { SyncedImage } from './useMiroSelection';
import { callPenpotMcpTool } from './companionRelayClient';
import { getValidToken } from '@/lib/tokens';

/** Fire a Google Analytics event if gtag is loaded. */
function trackEvent(action: string, label?: string, value?: number) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', action, {
      event_label: label,
      value: value,
      send_to: 'G-Q4W94QDWWC',
    });
  }
}

/**
 * Handles board sync with support for both Figma and Penpot:
 * - Default: update only the exact selected widget(s)
 * - syncAllCopies: scan the entire board and update every copy sharing the same keys
 *
 * Syncing strategy:
 * - Figma: batch rendered via the /api/figma/render-batch cloud endpoint.
 * - Penpot: fetched via the Ably relay (companion plugin executes the export).
 */
export function useMiroSync(
  figmaToken: string | null,
  miroToken: string | null,
  selectedItems: SyncedImage[],
  isSyncing: boolean,
  setIsSyncing: (val: boolean) => void,
  setSyncStatus: (val: string, type?: 'success' | 'error' | 'progress' | 'info') => void,
  propagate: boolean = false,
  preserveSize: boolean = false
) {
  const [syncAllCopies, setSyncAllCopies] = useState<boolean>(false);

  const syncSelectedScreens = async () => {
    if (isSyncing) return;
    if (selectedItems.length === 0) return;
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    // Get a fresh Miro token right before syncing — the one from mount may have expired
    const freshMiroToken = miroToken || await getValidToken('miro');
    if (!freshMiroToken) {
      setIsSyncing(false);
      setSyncStatus('Miro token unavailable. Please reconnect Miro.');
      return;
    }

    trackEvent('sync_start', `items:${selectedItems.length}`);
    setIsSyncing(true);
    try {
      setSyncStatus('Preparing items for sync...', 'progress');

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

      // ── Node name refresh from Figma API ──
      // Re-fetch names so stale placeholders (e.g. "Loading Node...") are replaced
      // with the actual Figma node name on every sync.
      const nameMap = new Map<string, string>();
      if (figmaToken) {
        const seen = new Set<string>();
        for (const s of selectedItems) {
          if (s.platform === "penpot") continue;
          const key = s.fileKey + "|" + s.nodeId;
          if (!seen.has(key)) {
            seen.add(key);
            try {
              const res = await fetch(
                `/api/figma/node-info?fileKey=${encodeURIComponent(s.fileKey)}&nodeId=${encodeURIComponent(s.nodeId)}`,
                { headers: { Authorization: `Bearer ${figmaToken}` } }
              );
              if (res.ok) {
                const data = await res.json();
                if (data.name) nameMap.set(key, data.name);
              }
            } catch (err) {
              console.warn("Failed to refresh node name for", s.nodeId, err);
            }
          }
        }
      }

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

            let storedWidth: number | undefined;
            try {
              const metadata = (await match.getMetadata()) as Record<string, unknown> | undefined;
              const syncData = metadata?.syncboard as { 
                format?: 'png' | 'svg'; 
                scale?: number;
                platform?: 'figma' | 'penpot';
                width?: number;
                height?: number;
              } | undefined;
              if (syncData) {
                format = syncData.format || (syncData.platform === 'penpot' ? 'svg' : 'png');
                scale = syncData.scale || 2;
                platform = syncData.platform || 'figma';
                if (typeof syncData.width === 'number' && syncData.width > 0) storedWidth = syncData.width;
              }
            } catch (err) {
              console.error("Failed to read copy metadata:", match.id, err);
            }

            // When propagate is enabled, override each copy's format/scale with the selected item's values
            const effectiveFormat = propagate ? (selected.format || (selected.platform === 'penpot' ? 'svg' : 'png')) : format;
            const effectiveScale = propagate ? (selected.scale || 2) : scale;

            // Calculate new display width.
            // For Penpot items with stored natural width: displayWidth = naturalWidth * effectiveScale.
            // This makes the widget visually scale with export resolution.
            // For Figma or items without stored width: scale proportionally from current widget width.
            // If match.width is 0 (common for SVG widgets in Miro), skip geometry and let Miro auto-size.
            let effectiveWidth: number | undefined;
            if (storedWidth && storedWidth > 0 && effectiveScale > 0) {
              effectiveWidth = Math.round(storedWidth * effectiveScale);
            } else if (propagate && effectiveScale !== scale && match.width && match.width > 0) {
              effectiveWidth = Math.round(match.width / scale * effectiveScale);
            } else if (match.width && match.width > 0) {
              effectiveWidth = match.width;
            }
            // If effectiveWidth is 0 or undefined, don't send geometry — let Miro auto-size.

            itemsToSync.push({
              id: match.id,
              fileKey: selected.fileKey,
              nodeId: selected.nodeId,
              nodeName: nameMap.get(selected.fileKey + '|' + selected.nodeId) || selected.nodeName,
              width: effectiveWidth,
              format: effectiveFormat,
              scale: effectiveScale,
              platform,
            });
          }
        }
      } else {
        itemsToSync = selectedItems.map(s => ({
          id: s.id,
          fileKey: s.fileKey,
          nodeId: s.nodeId,
          nodeName: nameMap.get(s.fileKey + '|' + s.nodeId) || s.nodeName,
          width: s.width,
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

      // Enforce batch limit of 3 unique export groups.
      // The UI already prevents the sync button when >3 groups are selected,
      // so this is a defensive check — silently truncating would hide bugs.
      const MAX_BATCH_SIZE = 3;
      const groupMap = new Map<string, SyncTarget[]>();
      for (const item of itemsToSync) {
        const gk = `${item.fileKey}|${item.nodeId}|${item.format}|${item.scale}|${item.platform}`;
        if (!groupMap.has(gk)) groupMap.set(gk, []);
        groupMap.get(gk)!.push(item);
      }
      if (groupMap.size > MAX_BATCH_SIZE) {
        throw new Error(`Can only sync up to ${MAX_BATCH_SIZE} different images at once. Deselect some to continue.`);
      }
      if (itemsToSync.length > MAX_BATCH_SIZE) {
        setSyncStatus(`Syncing ${itemsToSync.length} widget(s) across ${groupMap.size} frame(s)`);
      }

      // renderCache: "fileKey|nodeId|format" -> base64 data URL
      // Format is included in the key to prevent race conditions when copies have different formats
      const renderCache = new Map<string, string>();
      const nameCache = new Map<string, string>();

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
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${figmaToken}`,
            },
            body: JSON.stringify({ fileKey, nodeIds, format, scale }),
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
              renderCache.set(`${fileKey}|${nodeId}|${format}|${scale}`, dataUrl);
            }
          }
        }
      }

      // --- Penpot Batch Rendering (sequential, grouped by page via companion) ---
      if (penpotTargets.length > 0) {
        setSyncStatus(`Requesting ${penpotTargets.length} frame(s) from Penpot Companion relay...`);

        // Sequential per-item — the companion plugin handles page navigation
        // (openPage) within each export so the WASM cache is hot.
        for (const target of penpotTargets) {
          const format = target.format || 'svg';
          try {
            setSyncStatus(`Exporting Penpot frame: ${target.nodeName}...`);
            const mcpResponse = await callPenpotMcpTool('export_shape', {
              shapeId: target.nodeId,
              format: format,
              scale: target.scale || 2,
            });

            if (mcpResponse.content && mcpResponse.content.length > 0) {
              const content = mcpResponse.content[0];
              const cacheKey = `${target.fileKey}|${target.nodeId}`;
              // Update name from export response if present
              // Only use the export name if it's meaningful — reject
              // placeholders that would overwrite the widget's real name.
              if (content.name && typeof content.name === 'string' &&
                  content.name !== 'Selected Frame') {
                nameCache.set(cacheKey, content.name);
              }
              // Include format in render cache key to prevent race conditions
              // when copies have different formats
              const renderKey = `${target.fileKey}|${target.nodeId}|${format}|${target.scale || 2}`;
              if (format === 'svg' && content.text) {
                const base64 = btoa(unescape(encodeURIComponent(content.text)));
                const dataUrl = `data:image/svg+xml;base64,${base64}`;
                renderCache.set(renderKey, dataUrl);
              } else if (format === 'png' && content.data) {
                const dataUrl = `data:image/png;base64,${content.data}`;
                renderCache.set(renderKey, dataUrl);
              }
            } else {
              throw new Error('Penpot relay returned an empty payload.');
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Penpot export failed for node ${target.nodeId}:`, err);
            throw new Error(`Penpot sync failed for '${target.nodeName}': ${msg}. Make sure Penpot is open and the Companion Plugin is connected with the same Pairing ID.`);
          }
        }
      }

      // --- STEP 2: Update each board widget using the cached data URLs ---
      for (let i = 0; i < itemsToSync.length; i++) {
        const item = itemsToSync[i];
        // Look up by format-aware cache key (Penpot uses format in key, Figma doesn't)
        const cacheKey = `${item.fileKey}|${item.nodeId}`;
        const cacheFormat = item.format || 'png';
        const cacheScale = item.scale || 2;
        // Try format+scale aware key, then format-only fallback, then legacy key
        let dataUrl = renderCache.get(`${cacheKey}|${cacheFormat}|${cacheScale}`);
        if (!dataUrl) dataUrl = renderCache.get(`${cacheKey}|${cacheFormat}`);
        if (!dataUrl) dataUrl = renderCache.get(cacheKey); // fallback to legacy key
        if (!dataUrl) {
          console.warn(`No render cached for ${cacheKey}, skipping.`);
          continue;
        }

        if (i > 0) await new Promise(resolve => setTimeout(resolve, 500));
        // Use live name from export response if available, fall back to original
        const liveName = nameCache.get(`${item.fileKey}|${item.nodeId}`) || item.nodeName;
        setSyncStatus(`Updating canvas widget ${i + 1}/${itemsToSync.length}: ${liveName}`);

        const response = await fetch('/api/miro/update-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${freshMiroToken}`,
            ...(figmaToken ? { 'X-Figma-Token': figmaToken } : {}),
          },
          body: JSON.stringify({
            boardId,
            itemId: item.id,
            fileKey: item.fileKey,
            nodeId: item.nodeId,
            nodeName: liveName,
            width: item.width,
            dataUrl,
            format: item.format || (item.platform === 'penpot' ? 'svg' : 'png'),
            scale: item.scale || 2,
            platform: item.platform || 'figma',
            preserveSize,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to update image on Miro board');
        }

        // Update widget metadata so format/scale dropdown reflects the new values
        // (preserve natural width/height from Penpot import if present)
        try {
          const widget = await miro.board.getById(item.id);
          if (widget && 'setMetadata' in widget && typeof widget.setMetadata === 'function') {
            const existingMeta = await widget.getMetadata().catch(() => ({})) as Record<string, unknown>;
            const existingSyncboard = existingMeta?.syncboard as Record<string, unknown> | undefined;
            await widget.setMetadata('syncboard', {
              format: item.format || (item.platform === 'penpot' ? 'svg' : 'png'),
              scale: item.scale || 2,
              platform: item.platform || 'figma',
              // Preserve natural dimensions from the original import if they exist
              ...(existingSyncboard?.width ? { width: existingSyncboard.width } : {}),
              ...(existingSyncboard?.height ? { height: existingSyncboard.height } : {}),
            });
          }
        } catch (metaErr) {
          console.warn('Failed to update widget metadata:', metaErr);
        }
      }

      const label = syncAllCopies ? 'all copies' : 'selected widget(s)';
      setSyncStatus(`✓ Updated ${itemsToSync.length} ${label} successfully!`);

      try {
        const syncChannel = new BroadcastChannel('figma_miro_sync');
        syncChannel.postMessage({ type: 'SYNC_COMPLETE' });
        syncChannel.close();
      } catch {}
      trackEvent('sync_complete', `${itemsToSync.length} ${label}`, itemsToSync.length);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus(`Sync failed: ${errMsg}`);
      trackEvent('sync_error', errMsg);
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
