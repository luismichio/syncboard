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
  foreign?: { id: string; name: string }[];
  data?: { id: string; name: string; fileKey: string } | null;
  ok?: boolean;
  key?: string;
  error?: string;
  created?: boolean;
  editorType?: string;
}

// FigJam's createImageAsync rejects SVG data-URLs ("Image type is
// unsupported"), so SVG imports (Figma + Penpot) are rasterized to PNG in
// the browser before placement. The canvas is sized at the SVG's natural
// size × scale, so PNG pixels keep the same visual scale semantics as the
// direct-PNG path (1× = design size, 2× = double, crisp).
function decodeSvgDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return '';
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  if (head.includes('base64')) {
    try {
      const raw = atob(body);
      const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      try {
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return raw;
      }
    } catch {
      return '';
    }
  }
  try {
    return decodeURIComponent(body);
  } catch {
    return body;
  }
}

function svgTextDimensions(text: string): { width: number; height: number } | null {
  const head = text.slice(0, 4096);
  const w = /\bwidth=["']([\d.]+)/.exec(head);
  const h = /\bheight=["']([\d.]+)/.exec(head);
  let width = w ? parseFloat(w[1]) : NaN;
  let height = h ? parseFloat(h[1]) : NaN;
  if (!isFinite(width) || !isFinite(height)) {
    const vb = /\bviewBox=["']([-\d.\s]+)["']/.exec(head);
    if (vb && vb[1]) {
      const parts = vb[1].trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every((n) => isFinite(n))) {
        if (!isFinite(width)) width = parts[2];
        if (!isFinite(height)) height = parts[3];
      }
    }
  }
  if (isFinite(width) && isFinite(height) && width > 0 && height > 0 && width < 100000 && height < 100000) {
    return { width, height };
  }
  return null;
}

async function svgToPngDataUrl(
  svgDataUrl: string,
  scale: number,
  fallbackW?: number,
  fallbackH?: number
): Promise<string> {
  const dims = svgTextDimensions(decodeSvgDataUrl(svgDataUrl));
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const w = Math.max(1, Math.round((dims?.width || fallbackW || 240) * safeScale));
  const h = Math.max(1, Math.round((dims?.height || fallbackH || 160) * safeScale));
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('SVG rasterization failed (the browser rejected this SVG).'));
    img.src = svgDataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this webview.');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

async function exportPenpotViaRelay(
  objectId: string,
  format: 'png' | 'svg',
  scale: number
): Promise<{ dataUrl: string; name?: string; width?: number; height?: number }> {
  const pairingId = getOrCreatePairingId();
  if (!pairingId) {
    throw new Error('Pairing ID is not set. Copy it from Settings first.');
  }
  const data = await callRelay({
    pairingId,
    platform: 'penpot',
    action: 'export',
    shapeId: objectId,
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
  const name = payload.name ? decodeHtmlEntities(payload.name) : undefined;
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
  return { dataUrl, name, width: payload.width, height: payload.height };
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
  // Foreign nodes (images placed by hand / other plugins): selected but not
  // SyncingBoard mirrors — the Import tab can still REPLACE them.
  const [foreignSelection, setForeignSelection] = useState<{ id: string; name: string }[]>([]);
  // M3 live-push: opt-in toggle (OFF by default so the relay only runs on
  // explicit Detect presses — no quota burn without the user asking).
  const [liveFigmaSelection, setLiveFigmaSelection] = useState(false);
  const [editorType, setEditorType] = useState('figma');

  const tokenRef = useRef<string | null>(figmaToken);
  const placeWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Render cache: replaces/imports of the same frame+scale+format reuse the
  // last data-URL (90s TTL) instead of burning a Figma API render every
  // click — repeated replaces used to hit the rate limit after ~4 tries.
  const renderCacheRef = useRef(new Map<string, { value: unknown; at: number }>());
  const [rateLimited, setRateLimited] = useState(false);
  // Session API-call telemetry: renders hit Figma's REST API (the expensive,
  // rate-limited call); cache hits do not. Surfaced in Settings so the user
  // can see exactly how many calls each session burns.
  const [figmaApiCalls, setFigmaApiCalls] = useState(0);
  const [figmaCacheHits, setFigmaCacheHits] = useState(0);
  const [rateInfo, setRateInfo] = useState<{ planTier: string; limitType: string; retryAfter: number } | null>(null);
  const bumpApiCalls = useCallback((n = 1) => setFigmaApiCalls((c) => c + n), []);
  // M3 live-push guard: a selection streamed from Figma does not overwrite a
  // link the user just pasted or a frame they just detected (10s window).
  const lastManualFigSourceRef = useRef(0);

  const cachedFetch = useCallback(async <T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> => {
    const hit = renderCacheRef.current.get(key) as { value: T; at: number } | undefined;
    if (hit && Date.now() - hit.at < ttlMs) {
      setFigmaCacheHits((h) => h + 1);
      return hit.value;
    }
    const value = await fetcher();
    renderCacheRef.current.set(key, { value, at: Date.now() });
    if (renderCacheRef.current.size > 40) {
      const oldest = Array.from(renderCacheRef.current.entries()).sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) renderCacheRef.current.delete(oldest[0]);
    }
    return value;
  }, []);

  const noteError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (/rate.?limit|429|cooldown/i.test(msg)) {
      setRateLimited(true);
      window.setTimeout(() => setRateLimited(false), 20_000);
    }
    return msg;
  }, []);
  useEffect(() => {
    tokenRef.current = figmaToken;
  }, [figmaToken]);

  const status = useCallback((message: string, type: SyncStatusType = 'info') => {
    setSyncStatus({ message, type });
  }, []);

  // M3 relay-pull, opt-in: only when the user enables "Live Figma selection"
  // in Settings does the mirror subscribe to the Figma companion's live
  // selection (figma:<pairing>, subscribe-only token) — the two-files timeline.
  useEffect(() => {
    if (typeof window === 'undefined' || !liveFigmaSelection) return;
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
  }, [status, liveFigmaSelection]);

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
          const foreign = Array.isArray(msg.foreign) ? msg.foreign : [];
          setForeignSelection(
            foreign
              .filter((f: unknown): f is { id: string; name: string } => {
                const row = f as { id?: unknown; name?: unknown };
                return typeof row?.id === 'string' && row.id.length > 0;
              })
              .map((f) => ({ id: f.id, name: String(f.name || '') }))
          );
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
    const url = '/api/figma/render-batch';
    const body = JSON.stringify({ fileKey, nodeIds: [nodeId], format: formatSafe, scale: scaleSafe });
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
    const attempt = async (): Promise<string> => {
      bumpApiCalls();
      const res = await fetch(url, { method: 'POST', headers, body });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: string;
          retryAfter?: number | null;
          planTier?: string | null;
          limitType?: string | null;
        };
        const errText = errData.error || `Render HTTP ${res.status}`;
        const isRate = res.status === 429 || errText.includes('rate_limit_exceeded');
        let retryAfter = 9;
        if (isRate) {
          retryAfter = errData.retryAfter && errData.retryAfter > 0 ? errData.retryAfter : 9;
          setRateInfo({
            planTier: String(errData.planTier || 'unknown'),
            limitType: String(errData.limitType || 'unknown'),
            retryAfter,
          });
          setRateLimited(true);
          window.setTimeout(() => setRateLimited(false), Math.max(retryAfter, 5) * 1000 + 5_000);
          // One graceful retry after Figma's Retry-After window.
          await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 15) * 1000));
          bumpApiCalls();
          const retry = await fetch(url, { method: 'POST', headers, body });
          if (retry.ok) {
            const data = (await retry.json()) as { images?: Record<string, string | null> };
            const dataUrl = data.images?.[nodeId];
            if (dataUrl) return dataUrl;
          }
        }
        throw new Error(
          isRate
            ? `Figma is rate-limiting (plan: ${String(errData.planTier || 'unknown')}) — try again in ~${Math.min(
                retryAfter || 9,
                15
              )}s.`
            : errText
        );
      }
      const data = (await res.json()) as { images?: Record<string, string | null> };
      const dataUrl = data.images?.[nodeId];
      if (!dataUrl) throw new Error('Figma render returned no image for the node.');
      return dataUrl;
    };
    return attempt();
  }, [bumpApiCalls]);

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
      forceNodeIds?: string[];
      allCopies?: boolean;
      preserveSize?: boolean;
      width?: number;
      height?: number;
      replace?: boolean;
      placeNew?: boolean;
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
        // Replace mode reads the plugin's OWN selection — the plugin rewrites
        // whatever nodes are selected right now (tracked mirrors AND foreign
        // images), so the mirror never guesses ids.
        action: payload.replace ? 'figjam-replace' : 'figjam-place',
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
          forceNodeIds: payload.forceNodeIds,
          allCopies: payload.allCopies,
          preserveSize: payload.preserveSize,
          width: payload.width,
          height: payload.height,
          placeNew: payload.placeNew,
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
        bumpApiCalls();
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
        let dataUrl = await cachedFetch(
          `figma|${figmaNodeInfo.fileKey}|${figmaNodeInfo.nodeId}|${safeScale}|${safeFormat}`,
          90_000,
          () => renderNode(figmaNodeInfo.fileKey, figmaNodeInfo.nodeId, safeScale, safeFormat)
        );
        // FigJam rejects SVG images — rasterize in the browser first.
        if (safeFormat === 'svg') {
          dataUrl = await svgToPngDataUrl(dataUrl, safeScale);
        }
        placeOnBoard({
          fileKey: figmaNodeInfo.fileKey,
          nodeId: figmaNodeInfo.nodeId,
          name: figmaNodeInfo.name || 'Unnamed',
          scale: safeScale,
          dataUrl,
          format: safeFormat,
          placeNew: true,
        });
      } catch (err) {
        setIsSyncing(false);
        status(noteError(err), 'error');
      }
    },
    [figmaNodeInfo, cachedFetch, noteError, renderNode, placeOnBoard, status]
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
        let dataUrl = await cachedFetch(
          `figma|${first.fileKey}|${first.nodeId}|${scale}|${format}`,
          90_000,
          () => renderNode(first.fileKey, first.nodeId, scale, format)
        );
        // FigJam rejects SVG images — rasterize in the browser first.
        if (format === 'svg') {
          dataUrl = await svgToPngDataUrl(dataUrl, scale);
        }
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
        status(noteError(err), 'error');
        return;
      }
    }
    // Re-read the selection so the plugin's updated meta (format/scale)
    // round-trips back into the cards.
    postToPlugin({ action: 'get-selection-state' });
  }, [selectedItems, cachedFetch, noteError, renderNode, placeOnBoard, status, syncAllCopies, preserveSize]);

  // ---- Replace a selected board node (Import → Replace Selected) ----
  // The plugin reads the CURRENT canvas selection at message time and
  // replaces those nodes in place — tracked mirrors AND foreign images work
  // identically, with no id round-trip between mirror and plugin.
  const replaceSelectedWidget = useCallback(
    async (
      platform: 'figma' | 'penpot',
      fileKey: string,
      nodeId: string,
      nodeName: string,
      format: 'png' | 'svg',
      scale: number
    ) => {
      if (selectedItems.length === 0 && foreignSelection.length === 0) {
        status('Select a mirror or any image on the canvas to replace it.', 'error');
        return;
      }
      status(`Rendering ${nodeName || nodeId}…`, 'progress');
      try {
        let dataUrl: string;
        if (platform === 'penpot') {
          const exported = await cachedFetch(
            `penpot|${nodeId}|${scale}|${format}`,
            120_000,
            () => exportPenpotViaRelay(nodeId, format, scale)
          );
          dataUrl = exported.dataUrl;
          if (format === 'svg') {
            dataUrl = await svgToPngDataUrl(dataUrl, scale, exported.width, exported.height);
          }
        } else {
          dataUrl = await cachedFetch(
            `figma|${fileKey}|${nodeId}|${scale}|${format}`,
            90_000,
            () => renderNode(fileKey, nodeId, scale, format)
          );
          if (format === 'svg') {
            dataUrl = await svgToPngDataUrl(dataUrl, scale);
          }
        }
        placeOnBoard({
          fileKey,
          nodeId,
          name: nodeName || nodeId,
          scale,
          dataUrl,
          format,
          platform,
          preserveSize,
          replace: true,
        });
      } catch (err) {
        setIsSyncing(false);
        status(noteError(err), 'error');
      }
    },
    [selectedItems, foreignSelection, cachedFetch, noteError, renderNode, placeOnBoard, status, preserveSize]
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
        const exported = await cachedFetch(
          `penpot|${penpotNodeInfo.objectId}|${scale}|${format}`,
          120_000,
          () => exportPenpotViaRelay(penpotNodeInfo.objectId, format, scale)
        );
        const responseName = exported.name;
        if (responseName && responseName !== 'Selected Frame') {
          setPenpotNodeInfo((prev) => (prev ? { ...prev, name: responseName } : prev));
        }
        let dataUrl = exported.dataUrl;
        // FigJam rejects SVG images — rasterize in the browser first.
        if (format === 'svg') {
          dataUrl = await svgToPngDataUrl(dataUrl, scale, exported.width, exported.height);
        }
        const naturalWidth = exported.width && exported.width > 0 ? Math.round(exported.width * scale) : 0;
        const naturalHeight =
          exported.height && exported.height > 0 ? Math.round(exported.height * scale) : 0;
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
          placeNew: true,
        });
      } catch (err: unknown) {
        setIsSyncing(false);
        const errMsg = noteError(err);
        status(`${errMsg} — open the Penpot Companion window and re-try.`, 'error');
      }
    },
    [penpotNodeInfo, cachedFetch, noteError, placeOnBoard, status, preserveSize]
  );

  const pairingId = getOrCreatePairingId();

  const resetImportState = useCallback(() => {
    setFigmaNodeInfo(null);
    setPenpotNodeInfo(null);
    setFigmaInput('');
    setPenpotInput('');
    setFigmaParseError(null);
  }, []);

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
    isAnyImageSelected: selectedItems.length > 0 || foreignSelection.length > 0,
    replaceSelectedWidget,
    pairingId,
    liveFigmaSelection,
    setLiveFigmaSelection,
    rateLimited,
    figmaApiCalls,
    figmaCacheHits,
    rateInfo,
    resetImportState,
  } as const;
}