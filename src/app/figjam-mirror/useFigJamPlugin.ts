'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthTokens } from '@/app/miro-plugin/useAuthTokens';
import { parseFigmaUrl } from '@/lib/sync/figmaUrlParser';
import { parsePenpotUrl } from '@/lib/sync/penpotUrlParser';
import { callRelay, getOrCreatePairingId, subscribeRelayLive } from '@/lib/sync/companionRelayClient';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';
import { SyncedImage } from '@/app/miro-plugin/useMiroSelection';
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
  format?: 'png' | 'svg';
  scale?: number;
  platform?: 'figma' | 'penpot';
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

function trackedToSynced(items: FigjamTracked[]): SyncedImage[] {
  // One card per SELECTED image instance (duplicates are distinct board
  // nodes and count as separate selections — the SyncTab group badge shows
  // "xN"). Persisted per-instance format/scale/platform round-trip here.
  return items.map((t) => ({
    id: t.id || t.key || '',
    title: t.name || t.key || t.id || '',
    fileKey: t.fileKey || '',
    nodeId: t.nodeId || '',
    nodeName: t.name || '',
    format: t.format || 'png',
    scale: t.scale || 1,
    platform: t.platform || 'figma',
  }));
}

export function useFigJamPlugin() {
  const { figmaToken, tokensLoading, connectFigma, disconnectFigma } = useAuthTokens(false);
  const [selectedItems, setSelectedItems] = useState<SyncedImage[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [figmaInput, setFigmaInput] = useState('');
  const [figmaParseError, setFigmaParseError] = useState<string | null>(null);
  const [figmaNodeInfo, setFigmaNodeInfo] = useState<{
    fileKey: string;
    nodeId: string;
    name: string;
  } | null>(null);
  const [isDetectingLocal, setIsDetectingLocal] = useState(false);
  const [syncAllCopies, setSyncAllCopies] = useState(false);
  const [preserveSize, setPreserveSize] = useState(false);
  const [propagate, setPropagate] = useState(false);
  const [penpotInput, setPenpotInput] = useState('');
  const [penpotNodeInfo, setPenpotNodeInfo] = useState<{
    fileId: string;
    objectId: string;
    name: string;
  } | null>(null);
  const [isDetectingPenpotLocal, setIsDetectingPenpotLocal] = useState(false);
  const [editorType, setEditorType] = useState('figma');

  const tokenRef = useRef<string | null>(figmaToken);
  const placeWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // M3 live-push guard: a selection streamed from Figma does not overwrite a
  // link the user just pasted or a frame they just detected (10s window).
  const lastManualFigSourceRef = useRef(0);
  useEffect(() => {
    tokenRef.current = figmaToken;
  }, [figmaToken]);

  const status = useCallback((message: string, type: SyncStatusType = 'info') => {
    setSyncStatus({ message, type });
  }, []);

  // M3 relay-pull: subscribe to the Figma design companion's live selection
  // (figma:<pairing> channel, subscribe-only token) and fill the Import card
  // as the user clicks around the Figma file — the two-files timeline.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pairingId = getOrCreatePairingId();
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void subscribeRelayLive(pairingId, 'figma', 'selection', (payload) => {
      if (cancelled) return;
      const src = payload as { id?: string; name?: string; fileKey?: string };
      if (!src.id) return;
      if (Date.now() - lastManualFigSourceRef.current < 10_000) return;
      const fileKey = src.fileKey?.trim() || 'unknown';
      const name = decodeHtmlEntities(src.name || 'Figma Frame');
      setFigmaNodeInfo({ fileKey, nodeId: src.id, name });
      setFigmaInput(`https://www.figma.com/file/${fileKey}/?node-id=${encodeURIComponent(src.id)}`);
      setFigmaParseError(null);
      status(`Figma: "${name}" selected`, 'info');
    })
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
        } else {
          unsubscribe = cleanup;
        }
      })
      .catch(() => {
        // Companion channel may be empty right now — the detect button
        // still performs an explicit one-shot pull later.
      });
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [status]);

  // Mirrored board state + presence from the plugin.
  useEffect(() => {
    const onBridge = (event: MessageEvent) => {
      const msg = event.data as BridgeMsg | null;
      if (!msg || typeof msg !== 'object' || typeof msg.action !== 'string') return;

      switch (msg.action) {
        case 'figjam-selection': {
          // Selection-driven (Miro): the tab shows ONLY the tracked mirrors
          // selected on the FigJam canvas — empty selection = empty Sync (0),
          // never the full board registry.
          setSelectedItems(trackedToSynced(msg.tracked ?? []));
          break;
        }
        case 'figjam-place-result': {
          if (placeWatchdogRef.current) {
            clearTimeout(placeWatchdogRef.current);
            placeWatchdogRef.current = null;
          }
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
    // Kick the initial selection state on open: the plugin replies with
    // figjam-selection for the current canvas selection.
    postToPlugin({ action: 'get-selection-state' });
    return () => window.removeEventListener('message', onBridge);
  }, []);

  const renderNode = useCallback(async (fileKey: string, nodeId: string, scale?: number, format?: 'png' | 'svg') => {
    const token = tokenRef.current;
    if (!token) throw new Error('Missing Figma connection — connect Figma in Settings.');
    const scaleSafe = scale ?? 1;
    const formatSafe = format ?? 'png';
    const res = await fetch('/api/figma/render-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ fileKey, nodeIds: [nodeId], format: formatSafe, scale: scaleSafe }),
    });
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      const errText = errData.error || `Render HTTP ${res.status}`;
      if (res.status === 429 || errText.includes('rate_limit_exceeded')) {
        throw new Error('Figma is rate-limiting right now — wait a few seconds and retry.');
      }
      throw new Error(errText);
    }
    const data = (await res.json()) as { images?: Record<string, string | null> };
    const dataUrl = data.images?.[nodeId];
    if (!dataUrl) throw new Error('Figma render returned no image for the node.');
    return dataUrl;
  }, []);

  const placeOnBoard = useCallback(
    (payload: {
      fileKey: string;
      nodeId: string;
      name: string;
      scale: number;
      dataUrl: string;
      format: 'png' | 'svg';
      platform?: 'figma' | 'penpot';
      nodeIds?: string[];
      allCopies?: boolean;
      preserveSize?: boolean;
      width?: number;
      height?: number;
    }) => {
      setIsSyncing(true);
      // Watchdog: if the plugin never confirms (figjam-place-result), don't
      // leave the UI stuck in "Rendering…" forever — surface it instead.
      if (placeWatchdogRef.current) clearTimeout(placeWatchdogRef.current);
      placeWatchdogRef.current = setTimeout(() => {
        placeWatchdogRef.current = null;
        setIsSyncing(false);
        setSyncStatus({
          message: 'Placement sent but the plugin did not confirm (re-import the plugin; check the plugin console).',
          type: 'error',
        });
      }, 25000);
      postToPlugin({
        action: 'figjam-place',
        requestId: 'fjs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        payload: {
          fileKey: payload.fileKey,
          nodeId: payload.nodeId,
          name: payload.name,
          format: payload.format,
          platform: payload.platform || 'figma',
          scale: payload.scale,
          dataUrl: payload.dataUrl,
          nodeIds: payload.nodeIds,
          allCopies: payload.allCopies,
          preserveSize: payload.preserveSize,
          width: payload.width,
          height: payload.height,
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
        setFigmaParseError('Not a Figma frame link — copy the frame share link from Figma (needs ?node-id=…).');
        status('That does not look like a Figma file link', 'error');
        return;
      }
      lastManualFigSourceRef.current = Date.now();
      setFigmaParseError(null);
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
    [status]
  );

  const importFigmaScreen = useCallback(
    async (format?: 'png' | 'svg', scale?: number) => {
      if (!figmaNodeInfo) {
        status('Paste a Figma file link first', 'error');
        return;
      }
      const safeScale = scale ?? 1;
      const safeFormat = format ?? 'png';
      status(`Rendering ${figmaNodeInfo.name || figmaNodeInfo.nodeId}…`, 'progress');
      try {
        const dataUrl = await renderNode(figmaNodeInfo.fileKey, figmaNodeInfo.nodeId, safeScale, safeFormat);
        placeOnBoard({
          fileKey: figmaNodeInfo.fileKey,
          nodeId: figmaNodeInfo.nodeId,
          name: figmaNodeInfo.name || 'Unnamed',
          scale: safeScale,
          dataUrl,
          format: safeFormat,
        });
      } catch (err) {
        setIsSyncing(false);
        status(err instanceof Error ? err.message : 'Render error', 'error');
      }
    },
    [figmaNodeInfo, renderNode, placeOnBoard, status]
  );

  const detectLocalFigmaSelection = useCallback(async () => {
    setIsDetectingLocal(true);
    try {
      const pairingId = getOrCreatePairingId();
      if (!pairingId) {
        throw new Error('Pairing ID is not set. Open settings and copy a valid pairing ID first.');
      }
      // M3 relay-pull: ask the Figma design companion (same Pairing ID) for
      // its current selection over the figma:<pairing> channel.
      const data = await callRelay({
        pairingId,
        platform: 'figma',
        action: 'select',
        timeoutMs: 8000,
      });
      const payload = data as { id?: string; name?: string; fileKey?: string } | null;
      if (!payload?.id) {
        throw new Error('No frame currently selected in the Figma file.');
      }
      const fileKey = payload.fileKey?.trim() || 'unknown';
      const nodeId = payload.id;
      const name = decodeHtmlEntities(payload.name || 'Figma Frame');
      lastManualFigSourceRef.current = Date.now();
      setFigmaNodeInfo({ fileKey, nodeId, name });
      setFigmaInput(`https://www.figma.com/file/${fileKey}/?node-id=${encodeURIComponent(nodeId)}`);
      status(`Detected Figma frame: "${name}"`, 'info');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      status(`Detection failed: ${errMsg} — open the Figma Companion plugin and connect the same Pairing ID.`, 'error');
    } finally {
      setIsDetectingLocal(false);
    }
  }, [status]);

  // ---- Sync all mirrors ----
  const syncSelectedScreens = useCallback(async () => {
    const frames = selectedItems.filter((n) => n.fileKey && n.nodeId);
    if (frames.length === 0) {
      status('Nothing selected on the canvas', 'info');
      return;
    }
    // One render per unique frame key; update the requested instances
    // (selected ids, or all copies when the "update all copies" toggle is on).
    const byKey = new Map<string, SyncedImage[]>();
    for (const f of frames) {
      const k = `${f.fileKey}|${f.nodeId}`;
      const list = byKey.get(k) ?? [];
      list.push(f);
      byKey.set(k, list);
    }
    const keys = Array.from(byKey.keys());
    status(`Syncing ${keys.length} frame(s)…`, 'progress');
    setIsSyncing(true);
    for (let i = 0; i < keys.length; i++) {
      const items = byKey.get(keys[i]) as SyncedImage[];
      const first = items[0];
      try {
        const format = (first.format === 'svg' ? 'svg' : 'png') as 'png' | 'svg';
        const scale = first.scale ?? 1;
        const dataUrl = await renderNode(first.fileKey, first.nodeId, scale, format);
        placeOnBoard({
          fileKey: first.fileKey,
          nodeId: first.nodeId,
          name: first.nodeName || first.nodeId,
          scale,
          format,
          platform: (first.platform ?? 'figma') as 'figma' | 'penpot',
          dataUrl,
          nodeIds: items.map((it) => it.id).filter((id) => typeof id === 'string' && id.length > 0),
          allCopies: syncAllCopies,
          preserveSize,
        });
        if (i < keys.length - 1) {
          status(`Syncing ${i + 1}/${keys.length}…`, 'progress');
          // Pacing: Figma's REST API rate-limits bursts; keep a short gap
          // between renders so multi-frame syncs don't trip 429.
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      } catch (err) {
        setIsSyncing(false);
        status(err instanceof Error ? err.message : 'Sync error', 'error');
        return;
      }
    }
    // Re-read the selection so the plugin's updated meta (format/scale)
    // round-trips back into the cards.
    postToPlugin({ action: 'get-selection-state' });
  }, [selectedItems, renderNode, placeOnBoard, status, syncAllCopies, preserveSize]);

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
        const dataUrl = await renderNode(fileKey, nodeId, scale, format);
        placeOnBoard({ fileKey, nodeId, name: nodeName || nodeId, scale, dataUrl, format, preserveSize });
      } catch (err) {
        setIsSyncing(false);
        status(err instanceof Error ? err.message : 'Replace error', 'error');
      }
    },
    [renderNode, placeOnBoard, status, preserveSize]
  );

  // ---- Group setting changes (format/scale on the Sync cards) ----
  // Persist to the plugin nodes via figjam-set-meta; propagate extends to
  // sibling copies of the same frame key.
  const applyGroupSettings = useCallback(
    (itemIds: string[], key: 'format' | 'scale', value: unknown) => {
      const ids = itemIds.filter((id) => typeof id === 'string' && id.length > 0);
      if (ids.length === 0) return;
      const payload: Record<string, unknown> = { action: 'figjam-set-meta', nodeIds: ids };
      if (key === 'format') {
        const fmt = String(value);
        payload.format = fmt === 'svg' ? 'svg' : 'png';
      } else {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) payload.scale = num;
      }
      payload.propagate = propagate;
      postToPlugin(payload);
      // Optimistic card update.
      setSelectedItems((prev) =>
        prev.map((it) =>
          ids.includes(it.id)
            ? {
                ...it,
                format: payload.format ? (payload.format as 'png' | 'svg') : it.format,
                scale: payload.scale ? Number(payload.scale) : it.scale,
              }
            : it
        )
      );
    },
    [propagate]
  );

  // ---- Penpot (paste link + detect via the Penpot Companion relay) ----
  const parsePenpotLink = useCallback((url: string): boolean => {
    setPenpotInput(url);
    const parsed = parsePenpotUrl(url);
    if (parsed) {
      setPenpotNodeInfo({
        fileId: parsed.fileId,
        objectId: parsed.objectId,
        name: 'Selected Frame',
      });
      status('Valid Penpot link detected.');
      return true;
    }
    setPenpotNodeInfo(null);
    status('That does not look like a Penpot file link', 'error');
    return false;
  }, [status]);

  const detectLocalPenpotSelection = useCallback(async () => {
    setIsDetectingPenpotLocal(true);
    try {
      const pairingId = getOrCreatePairingId();
      if (!pairingId) {
        throw new Error('Pairing ID is not set. Open settings and copy a valid pairing ID first.');
      }
      const data = await callRelay({
        pairingId,
        platform: 'penpot',
        action: 'select',
        timeoutMs: 8000,
      });
      const payload = data as { id?: string; name?: string; fileId?: string } | null;
      if (!payload?.id) {
        throw new Error('No frame currently selected in Penpot.');
      }
      setPenpotNodeInfo({
        fileId: payload.fileId || 'unknown-file',
        objectId: payload.id,
        name: payload.name ? decodeHtmlEntities(payload.name) : 'Penpot Frame',
      });
      status(`Detected Penpot frame: "${payload.name || payload.id}"`, 'info');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      status(`Detection failed: ${errMsg} (Tip: open the Penpot Companion and connect the same Pairing ID.)`, 'error');
    } finally {
      setIsDetectingPenpotLocal(false);
    }
  }, [status]);

  const importPenpotScreen = useCallback(
    async (format: 'png' | 'svg' = 'svg', scale: number = 1) => {
      if (!penpotNodeInfo) {
        status('Paste a Penpot file link first', 'error');
        return;
      }
      setIsSyncing(true);
      status('Waiting for the Penpot Companion (open it on the same Pairing ID)…', 'progress');
      try {
        // Direct callRelay: same export path as callPenpotMcpTool but with a
        // human-scale timeout — the companion may be closed, better to fail
        // with guidance than to spin for two minutes.
        const pairingId = getOrCreatePairingId();
        if (!pairingId) {
          throw new Error('Pairing ID is not set. Copy it from Settings first.');
        }
        const data = await callRelay({
          pairingId,
          platform: 'penpot',
          action: 'export',
          shapeId: penpotNodeInfo.objectId,
          format,
          scale,
          timeoutMs: 45_000,
        });
        const payload = data as {
          svg?: string;
          base64?: string;
          name?: string;
          width?: number;
          height?: number;
        } | null;
        if (!payload) {
          throw new Error('Penpot relay returned an empty export.');
        }
        const responseName = payload.name ? decodeHtmlEntities(payload.name) : undefined;
        if (responseName && responseName !== 'Selected Frame') {
          setPenpotNodeInfo((prev) => (prev ? { ...prev, name: responseName } : prev));
        }
        let dataUrl: string;
        if (format === 'svg') {
          if (!payload.svg) {
            throw new Error('Penpot relay returned empty SVG export data.');
          }
          const svgBase64 = btoa(unescape(encodeURIComponent(payload.svg)));
          dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
        } else {
          if (!payload.base64) {
            throw new Error('Penpot relay returned empty PNG export data.');
          }
          dataUrl = `data:image/png;base64,${payload.base64}`;
        }
        const naturalWidth = payload.width && payload.width > 0 ? Math.round(payload.width * scale) : 0;
        const naturalHeight =
          payload.height && payload.height > 0 ? Math.round(payload.height * scale) : 0;
        const resolvedName =
          (responseName && responseName !== 'Selected Frame' ? responseName : penpotNodeInfo.name) ||
          'Penpot Frame';
        status(`Rendering ${resolvedName}…`, 'progress');
        placeOnBoard({
          fileKey: penpotNodeInfo.fileId,
          nodeId: penpotNodeInfo.objectId,
          name: resolvedName,
          scale,
          format,
          platform: 'penpot',
          dataUrl,
          width: naturalWidth || undefined,
          height: naturalHeight || undefined,
          preserveSize,
        });
      } catch (err: unknown) {
        setIsSyncing(false);
        const errMsg = err instanceof Error ? err.message : 'Penpot import error';
        status(`${errMsg} — open the Penpot Companion window and re-try.`, 'error');
      }
    },
    [penpotNodeInfo, placeOnBoard, status, preserveSize]
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
    figmaParseError,
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
    penpotInput,
    penpotNodeInfo,
    isDetectingPenpotLocal,
    parsePenpotLink,
    detectLocalPenpotSelection,
    importPenpotScreen,
    syncSelectedScreens,
    syncAllCopies,
    setSyncAllCopies,
    preserveSize,
    setPreserveSize,
    propagate,
    setPropagate,
    applyGroupSettings,
    cooldownSeconds: 0,
    isAnyImageSelected: selectedItems.length > 0,
    replaceSelectedWidget,
    pairingId,
  } as const;
}