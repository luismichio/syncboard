'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthTokens } from '@/app/miro-plugin/useAuthTokens';
import { SyncedImage } from '@/app/miro-plugin/useMiroSelection';
import { getOrCreatePairingId } from '@/lib/sync/pairingId';
import type { SyncStatus, SyncStatusType } from '@/app/miro-plugin/useMiroPlugin';

/**
 * FigJam target hook. The FigJam board is the destination; the plugin exposes
 * the board via figma.ui postMessage. This hook mirrors the shape of
 * useMiroPlugin so the SAME sidebar components render identically for Miro and
 * FigJam (the shared TargetAdapter UI mirror).
 *
 * Bridge:
 *   -> plugin: window.parent.postMessage({ action, ... }, '*')
 *   <- plugin: window.onmessage ({ action: ... })
 */

interface FigjamTracked {
  id: string;
  key?: string;
  fileKey?: string;
  nodeId?: string;
  name?: string;
}

interface BridgeMsg {
  action: string;
  selected?: FigjamTracked[];
  tracked?: FigjamTracked[];
  data?: { id: string; name: string; fileKey: string } | null;
  ok?: boolean;
  key?: string;
  error?: string;
  created?: boolean;
  editorType?: string;
}

function postToPlugin(msg: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  window.parent.postMessage(msg, '*');
}

function parseFigmaUrl(raw: string): { fileKey: string; nodeId: string } | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  const fileMatch = url.match(/\/(?:design|file|dev)\/([A-Za-z0-9_-]+)/);
  const nodeMatch = url.match(/[?&]node-id=([^&=]+)/);
  if (!fileMatch || !nodeMatch) return null;
  const fileKey = fileMatch[1];
  const nodeId = decodeURIComponent(nodeMatch[1]) || '';
  if (!fileKey || !nodeId) return null;
  return { fileKey, nodeId };
}

function trackedToSynced(items: FigjamTracked[]): SyncedImage[] {
  return items.map((t) => ({
    id: t.id || t.key || '',
    title: t.name || t.key || t.id || '',
    fileKey: t.fileKey || '',
    nodeId: t.nodeId || '',
    nodeName: t.name || '',
    format: 'png',
    scale: 1,
    platform: 'figma',
  }));
}

export function useFigJamPlugin() {
  const { figmaToken, tokensLoading, connectFigma, disconnectFigma } = useAuthTokens(false);
  const [selectedItems, setSelectedItems] = useState<SyncedImage[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [figmaInput, setFigmaInput] = useState('');
  const [figmaNodeInfo, setFigmaNodeInfo] = useState<{
    fileKey: string;
    nodeId: string;
    name: string;
  } | null>(null);
  const [isDetectingLocal, setIsDetectingLocal] = useState(false);
  const [syncAllCopies, setSyncAllCopies] = useState(false);
  const [editorType, setEditorType] = useState('figma');

  const tokenRef = useRef<string | null>(figmaToken);
  useEffect(() => {
    tokenRef.current = figmaToken;
  }, [figmaToken]);

  const status = useCallback((message: string, type: SyncStatusType = 'info') => {
    setSyncStatus({ message, type });
  }, []);

  // Mirrored board state + presence from the plugin.
  useEffect(() => {
    const onBridge = (event: MessageEvent) => {
      const msg = event.data as BridgeMsg | null;
      if (!msg || typeof msg !== 'object' || typeof msg.action !== 'string') return;

      switch (msg.action) {
        case 'figjam-state': {
          const tracked = msg.selected ?? msg.tracked ?? [];
          const incoming = trackedToSynced(tracked);
          setSelectedItems((prev) => {
            if (incoming.length === 0) return prev;
            const byKey = new Map<string, SyncedImage>();
            prev.forEach((p) => byKey.set(`${p.fileKey}|${p.nodeId}`, p));
            incoming.forEach((i) => byKey.set(`${i.fileKey}|${i.nodeId}`, i));
            return Array.from(byKey.values());
          });
          break;
        }
        case 'figjam-place-result': {
          setIsSyncing(false);
          if (msg.ok) {
            setSyncStatus({
              message: msg.created ? `Synced ${msg.key ?? ''}` : `Updated ${msg.key ?? ''}`,
              type: 'success',
            });
          } else {
            setSyncStatus({ message: msg.error || 'Sync failed', type: 'error' });
          }
          postToPlugin({ action: 'figjam-list' });
          break;
        }
        case 'selection-result': {
          setIsDetectingLocal(false);
          if (msg.error) setSyncStatus({ message: `Selection: ${msg.error}`, type: 'error' });
          else if (msg.data) setSyncStatus({ message: `Detected board node: ${msg.data.name}`, type: 'info' });
          else setSyncStatus({ message: 'Nothing selected on the board', type: 'info' });
          break;
        }
        case 'editor-type': {
          if (msg.editorType !== undefined) {
            setEditorType(String(msg.editorType));
          }
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('message', onBridge);
    postToPlugin({ action: 'figjam-list' });
    return () => window.removeEventListener('message', onBridge);
  }, []);

  const renderNode = useCallback(async (fileKey: string, nodeId: string, scale?: number) => {
    const token = tokenRef.current;
    if (!token) throw new Error('Missing Figma connection — connect Figma in Settings.');
    const scaleSafe = scale ?? 1;
    const res = await fetch('/api/figma/render-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ fileKey, nodeIds: [nodeId], format: 'png', scale: scaleSafe }),
    });
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || `Render HTTP ${res.status}`);
    }
    const data = (await res.json()) as { images?: Record<string, string | null> };
    const dataUrl = data.images?.[nodeId];
    if (!dataUrl) throw new Error('Figma render returned no image for the node.');
    return dataUrl;
  }, []);

  const placeOnBoard = useCallback(
    (payload: { fileKey: string; nodeId: string; name: string; scale: number; dataUrl: string }) => {
      setIsSyncing(true);
      postToPlugin({
        action: 'figjam-place',
        requestId: 'fjs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        payload: {
          fileKey: payload.fileKey,
          nodeId: payload.nodeId,
          name: payload.name,
          format: 'png',
          scale: payload.scale,
          dataUrl: payload.dataUrl,
        },
      });
    },
    []
  );

  // ---- Import (Figma link -> render -> place) ----
  const parseFigmaLink = useCallback(
    async (url: string): Promise<void> => {
      const parsed = parseFigmaUrl(url);
      if (!parsed) {
        status('That does not look like a Figma file link', 'error');
        return;
      }
      setFigmaInput(url);
      const capture: { fileKey: string; nodeId: string; name: string } = {
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
        name: parsed.nodeId,
      };
      if (tokenRef.current) {
        try {
          const res = await fetch(
            `/api/figma/node-info?fileKey=${encodeURIComponent(parsed.fileKey)}&nodeId=${encodeURIComponent(parsed.nodeId)}`,
            { headers: { Authorization: 'Bearer ' + tokenRef.current } }
          );
          if (res.ok) {
            const data = (await res.json()) as { name?: string };
            if (data.name) capture.name = data.name;
          }
        } catch {
          // name falls back to nodeId
        }
      }
      setFigmaNodeInfo(capture);
      status('Figma frame ready to place', 'info');
      return;
    },
    []
  );

  const importFigmaScreen = useCallback(
    async (format?: 'png' | 'svg', scale?: number) => {
      if (!figmaNodeInfo) {
        status('Paste a Figma file link first', 'error');
        return;
      }
      const safeScale = scale ?? 1;
      status(`Rendering ${figmaNodeInfo.name || figmaNodeInfo.nodeId}…`, 'progress');
      try {
        const dataUrl = await renderNode(figmaNodeInfo.fileKey, figmaNodeInfo.nodeId, safeScale);
        placeOnBoard({
          fileKey: figmaNodeInfo.fileKey,
          nodeId: figmaNodeInfo.nodeId,
          name: figmaNodeInfo.name || 'Unnamed',
          scale: safeScale,
          dataUrl,
        });
        void format;
      } catch (err) {
        setIsSyncing(false);
        status(err instanceof Error ? err.message : 'Render error', 'error');
      }
    },
    [figmaNodeInfo, renderNode, placeOnBoard, status]
  );

  const detectLocalFigmaSelection = useCallback(async () => {
    setIsDetectingLocal(true);
    postToPlugin({ action: 'get-selection', requestId: 'fj-det-' + Date.now() });
  }, []);

  // ---- Sync all mirrors ----
  const syncSelectedScreens = useCallback(async () => {
    const frames = selectedItems.filter((n) => n.fileKey && n.nodeId && n.format === 'png');
    if (frames.length === 0) {
      status('Nothing to mirror yet', 'info');
      return;
    }
    status(`Mirroring ${frames.length} frame(s)…`, 'progress');
    setIsSyncing(true);
    for (let i = 0; i < frames.length; i++) {
      const item = frames[i];
      try {
        const dataUrl = await renderNode(item.fileKey, item.nodeId, item.scale);
        placeOnBoard({
          fileKey: item.fileKey,
          nodeId: item.nodeId,
          name: item.nodeName || item.nodeId,
          scale: item.scale ?? 1,
          dataUrl,
        });
        if (i < frames.length - 1) status(`Mirroring ${i + 1}/${frames.length}…`, 'progress');
      } catch (err) {
        setIsSyncing(false);
        status(err instanceof Error ? err.message : 'Mirror error', 'error');
        return;
      }
    }
  }, [selectedItems, renderNode, placeOnBoard, status]);

  // ---- Adopt (replace a selected board node) ----
  const replaceSelectedWidget = useCallback(
    async (
      platform: 'figma' | 'penpot',
      fileKey: string,
      nodeId: string,
      nodeName: string,
      format: 'png' | 'svg',
      scale: number
    ) => {
      if (platform !== 'figma') {
        status('Penpot source is Miro-only for now', 'info');
        return;
      }
      status(`Rendering ${nodeName || nodeId}…`, 'progress');
      try {
        const dataUrl = await renderNode(fileKey, nodeId, scale);
        placeOnBoard({ fileKey, nodeId, name: nodeName || nodeId, scale, dataUrl });
        void format;
      } catch (err) {
        setIsSyncing(false);
        status(err instanceof Error ? err.message : 'Replace error', 'error');
      }
    },
    [renderNode, placeOnBoard, status]
  );

  const pairingId = getOrCreatePairingId();

  return {
    isInitMode: false,
    editorType,
    figmaToken,
    miroToken: null,
    tokensLoading,
    selectedItems,
    setSelectedItems,
    isSyncing,
    syncStatus,
    figmaInput,
    figmaNodeInfo,
    isDetectingLocal,
    connectFigma,
    connectMiro: () => {},
    disconnectFigma,
    disconnectMiro: async (): Promise<void> => undefined,
    parseFigmaLink,
    detectLocalFigmaSelection,
    importFigmaScreen,
    penpotInput: '',
    penpotNodeInfo: null,
    isDetectingPenpotLocal: false,
    parsePenpotLink: async (): Promise<boolean> => false,
    detectLocalPenpotSelection: async (): Promise<void> => undefined,
    importPenpotScreen: async (): Promise<void> => undefined,
    syncSelectedScreens,
    syncAllCopies,
    setSyncAllCopies,
    cooldownSeconds: 0,
    isAnyImageSelected: selectedItems.length > 0,
    replaceSelectedWidget,
    pairingId,
  } as const;
}