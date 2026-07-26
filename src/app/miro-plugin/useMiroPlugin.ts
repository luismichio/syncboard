import { useEffect, useState } from 'react';
import { useAuthTokens } from './useAuthTokens';
import { useMiroSelection } from './useMiroSelection';
import { useFigmaImporter } from './useFigmaImporter';
import { usePenpotImporter } from './usePenpotImporter';
import { useMiroSync } from './useMiroSync';
import { getValidToken } from '@/lib/tokens';
import { trackEvent } from '@/lib/analytics';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';

export type SyncStatusType = 'success' | 'error' | 'progress' | 'info';

export interface SyncStatus {
  message: string;
  type: SyncStatusType;
}

/**
 * Main coordinator hook for the Miro sidebar panel app.
 * Integrates single-responsibility sub-hooks (Figma & Penpot) to provide a unified API.
 */
export function useMiroPlugin(propagate: boolean = false, preserveSize: boolean = false) {
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  // Backward-compatible wrapper: accepts (string) for old-style calls
  // with type inferred from content, or (message, type) for explicit typing.
  const updateSyncStatus = (message: string, type?: SyncStatusType) => {
    if (type) {
      setSyncStatus({ message, type });
    } else {
      // Infer type from message content
      const inferred: SyncStatusType =
        message.startsWith('✓') ? 'success' :
        message.startsWith('✗') || message.toLowerCase().includes('fail') ? 'error' :
        message.startsWith('Updating') || message.includes('...') ? 'progress' :
        'info';
      setSyncStatus({ message, type: inferred });
    }
  };

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
    isAnyImageSelected,
  } = useMiroSelection(isInitMode);

  // 3. Figma Importer Hook
  const {
    figmaInput,
    figmaNodeInfo,
    isDetectingLocal,
    parseFigmaLink,
    detectLocalFigmaSelection,
    importFigmaScreen,
  } = useFigmaImporter(figmaToken, miroToken, setIsSyncing, updateSyncStatus);

  // 4. Penpot Importer Hook
  const {
    penpotInput,
    penpotNodeInfo,
    isDetectingLocal: isDetectingPenpotLocal,
    parsePenpotLink,
    detectLocalPenpotSelection,
    importPenpotScreen,
  } = usePenpotImporter(miroToken, setIsSyncing, updateSyncStatus);

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
    updateSyncStatus,
    propagate,
    preserveSize
  );

  /**
   * Adopt or re-target image widgets on the board to a chosen Figma/Penpot frame.
   *
   * - For non-SyncBoard images: attaches syncboard metadata (adoption).
   * - For existing SyncBoard images: updates syncboard.key (re-targeting).
   * - Then replaces the image content with the chosen frame render.
   *
   * The widget ID never changes → connectors, comments, links, frame membership all survive.
   */
  const replaceSelectedWidget = async (
    platform: 'figma' | 'penpot',
    fileKey: string,
    nodeId: string,
    nodeName: string,
    format: 'png' | 'svg',
    scale: number
  ) => {
    if (typeof window === 'undefined') return;
    const miro = window.miro;
    if (!miro) return;

    setIsSyncing(true);

    try {
      const selection = await miro.board.getSelection();
      const images = selection.filter((w): w is typeof w & { type: 'image' } => w.type === 'image');

      if (images.length === 0) {
        updateSyncStatus('No image widgets selected. Select at least one image on the board.', 'error');
        setIsSyncing(false);
        return;
      }

      // Collect adopted items
      const adoptedItems: {
        id: string;
        width?: number;
      }[] = [];

      for (const img of images) {
        // Read existing metadata (re-targeting if syncboard already exists)
        const existingMeta = await img.getMetadata() as Record<string, unknown> | undefined;
        const existingSync = existingMeta?.syncboard as Record<string, unknown> | undefined;

        // Attach/update syncboard metadata with the new frame info
        const syncMeta: Record<string, unknown> = {
          fileKey,
          nodeId,
          nodeName,
          format,
          scale,
          platform,
        };

        // Preserve natural width if it exists (from a previous Penpot import)
        if (existingSync?.width && typeof existingSync.width === 'number') {
          syncMeta.width = existingSync.width;
        }

        await img.setMetadata('syncboard', syncMeta);
        await img.sync();

        adoptedItems.push({
          id: img.id,
          width: img.width ?? undefined,
        });
      }

      // Now sync each adopted widget with the new image content
      const boardInfo = await miro.board.getInfo();
      const freshMiroToken = miroToken || await getValidToken('miro');

      if (!freshMiroToken) {
        updateSyncStatus('Miro token unavailable. Please reconnect Miro.', 'error');
        setIsSyncing(false);
        return;
      }

      // Render the frame image once (shared across all adopted copies)
      let dataUrl: string | null = null;

      if (platform === 'figma') {
        if (!figmaToken) {
          throw new Error('Figma token missing. Please connect Figma in Settings.');
        }

        updateSyncStatus('Rendering Figma frame...', 'progress');
        const batchRes = await fetch('/api/figma/render-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${figmaToken}`,
          },
          body: JSON.stringify({ fileKey, nodeIds: [nodeId], format, scale }),
        });

        if (!batchRes.ok) {
          const errData = await batchRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `Figma render failed (HTTP ${batchRes.status})`);
        }

        const { images } = await batchRes.json() as { images: Record<string, string | null> };
        dataUrl = images[nodeId];
      } else {
        // Penpot
        updateSyncStatus('Exporting Penpot frame...', 'progress');
        const { callPenpotMcpTool } = await import('./companionRelayClient');
        const mcpResponse = await callPenpotMcpTool('export_shape', {
          shapeId: nodeId,
          format,
          scale,
        });

        if (mcpResponse.content?.[0]) {
          const content = mcpResponse.content[0];
          if (format === 'svg' && content.text) {
            const b64 = btoa(unescape(encodeURIComponent(content.text)));
            dataUrl = `data:image/svg+xml;base64,${b64}`;
          } else if (format === 'png' && content.data) {
            dataUrl = `data:image/png;base64,${content.data}`;
          }
        }
      }

      if (!dataUrl) {
        throw new Error('Failed to render the selected frame. No image data received.');
      }

      for (let i = 0; i < adoptedItems.length; i++) {
        const item = adoptedItems[i];
        if (i > 0) await new Promise(r => setTimeout(r, 500));
        updateSyncStatus(`Replacing widget ${i + 1}/${adoptedItems.length}...`, 'progress');

        const response = await fetch('/api/miro/update-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${freshMiroToken}`,
          },
          body: JSON.stringify({
            boardId: boardInfo.id,
            itemId: item.id,
            fileKey,
            nodeId,
            nodeName,
            width: item.width,
            dataUrl,
            format,
            scale,
            platform,
            preserveSize,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || 'Failed to update image on Miro board');
        }

        // Update widget title via SDK to reflect the new frame name
        try {
          const widget = await miro.board.getById(item.id);
          if (widget) {
            const tag = platform === 'penpot' ? 'PenpotSync' : 'SyncBoard';
            const titleTag = `${decodeHtmlEntities(nodeName)} [${tag}|${fileKey}|${nodeId}]`;
            widget.title = titleTag;
            await widget.sync();
          }
        } catch {
          // SDK title assignment may fail silently
        }
      }

      updateSyncStatus(`✓ Replaced ${adoptedItems.length} widget(s) successfully!`, 'success');
      trackEvent('sync_complete', `replace:${adoptedItems.length}`, adoptedItems.length);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      updateSyncStatus(`Replace failed: ${errMsg}`, 'error');
      trackEvent('sync_error', errMsg);
    } finally {
      setIsSyncing(false);
    }
  };

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
    // Selection state
    isAnyImageSelected,
    // Replace / Adopt
    replaceSelectedWidget,
  };
}
