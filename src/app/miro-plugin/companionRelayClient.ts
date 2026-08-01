import Ably from 'ably';
import { getOrCreatePairingId } from '@/lib/pairingId';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';

export interface PenpotMcpResponse {
  content: { type: string; text?: string; data?: string; mimeType?: string; name?: string; width?: number; height?: number }[];
  isError?: boolean;
}

export type RelayJson = null | boolean | number | string | RelayJson[] | { [key: string]: RelayJson };

export interface RelayRequestBody {
  pairingId: string;
  platform?: 'figma' | 'penpot';
  action: 'select' | 'export';
  shapeId?: string;
  format?: 'svg' | 'png';
  scale?: number;
  timeoutMs?: number;
}

export { getOrCreatePairingId };

let globalAblyClient: Ably.Realtime | null = null;
let globalAblyChannel: Ably.RealtimeChannel | null = null;
let currentConnectedPairingId: string | null = null;
let currentConnectedPlatform: 'figma' | 'penpot' | null = null;

async function getAblyConnection(
  pairingId: string,
  platform: 'figma' | 'penpot' = 'penpot'
): Promise<Ably.RealtimeChannel> {
  const prefix = platform === 'figma' ? 'figma' : 'penpot';

  if (
    globalAblyClient &&
    globalAblyChannel &&
    currentConnectedPairingId === pairingId &&
    currentConnectedPlatform === platform
  ) {
    return globalAblyChannel;
  }

  if (globalAblyClient) {
    try {
      globalAblyClient.close();
    } catch {
      // ignore stale close errors
    }
    globalAblyClient = null;
    globalAblyChannel = null;
  }

  globalAblyClient = new Ably.Realtime({
    authUrl: `/api/ably/token?pairingId=${encodeURIComponent(pairingId)}&platform=${platform}`,
    authMethod: 'GET',
  });

  globalAblyChannel = globalAblyClient.channels.get(`${prefix}:${pairingId}`);
  currentConnectedPairingId = pairingId;
  currentConnectedPlatform = platform;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Ably connection timed out.')), 10000);

    globalAblyClient!.connection.once('connected', () => {
      clearTimeout(timeout);
      resolve();
    });

    globalAblyClient!.connection.once('failed', (state) => {
      clearTimeout(timeout);
      reject(new Error(state.reason?.message || 'Ably connection failed'));
    });
  });

  return globalAblyChannel;
}

export async function callRelay(body: RelayRequestBody): Promise<RelayJson> {
  const pairingId = body.pairingId;
  const platform = body.platform || 'penpot';
  const channel = await getAblyConnection(pairingId, platform);

  return new Promise<RelayJson>((resolve, reject) => {
    let resolved = false;
    let targetRequestId: string | null = null;
    const earlyResults = new Map<string, Record<string, unknown>>();

    const cleanup = () => {
      resolved = true;
      try {
        channel.unsubscribe('result', onResult);
        channel.unsubscribe('result-ready', onResultReady);
      } catch {
        // ignore
      }
      clearTimeout(timeout);
    };

    const processResultData = (msgData: Record<string, unknown>) => {
      cleanup();
      if (msgData.error) {
        reject(new Error(String(msgData.error)));
      } else {
        resolve((msgData.data as RelayJson) ?? null);
      }
    };

    const onResult = (msg: Ably.Message) => {
      const msgData = msg.data as Record<string, unknown> | null;
      const reqId = typeof msgData?.requestId === 'string' ? msgData.requestId : null;
      if (!reqId || !msgData) return;

      if (targetRequestId && reqId === targetRequestId) {
        processResultData(msgData);
      } else {
        earlyResults.set(reqId, msgData);
      }
    };

    const onResultReady = async (msg: Ably.Message) => {
      const msgData = msg.data as Record<string, unknown> | null;
      const reqId = typeof msgData?.requestId === 'string' ? msgData.requestId : null;
      if (!reqId || !targetRequestId || reqId !== targetRequestId) return;

      cleanup();
      try {
        const fetchRes = await fetch(`/api/relay/response?requestId=${targetRequestId}`);
        if (!fetchRes.ok) {
          const errData = await fetchRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `HTTP ${fetchRes.status}`);
        }
        const fetchPayload = await fetchRes.json() as { data?: RelayJson };
        resolve(fetchPayload.data ?? null);
      } catch (fetchErr: unknown) {
        const errorMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        reject(new Error(`Failed to retrieve relay response: ${errorMsg}`));
      }
    };

    const timeout = setTimeout(() => {
      if (resolved) return;
      cleanup();
      reject(new Error('Relay timed out waiting for companion response.'));
    }, body.timeoutMs || 10000);

    channel.subscribe('result', onResult);
    channel.subscribe('result-ready', onResultReady);

    fetch('/api/relay/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        async: true,
      }),
    })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as { error?: string; data?: { requestId: string } };
        if (!res.ok || payload.error || !payload.data?.requestId) {
          throw new Error(payload.error || `Relay request failed with HTTP ${res.status}`);
        }

        targetRequestId = payload.data.requestId;

        if (earlyResults.has(targetRequestId)) {
          const early = earlyResults.get(targetRequestId);
          if (early) {
            processResultData(early);
          }
        }
      })
      .catch((err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

/**
 * Penpot bridge abstraction:
 * - Cloud relay mode (default), routed through /api/relay/* endpoints.
 */
export async function callPenpotMcpTool(
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<PenpotMcpResponse> {
  if (typeof window === 'undefined') {
    throw new Error('Window context is required.');
  }

  const pairingId = getOrCreatePairingId();

  if (toolName === 'export_shape') {
    const shapeId = toolArgs.shapeId as string;
    const format = (toolArgs.format as 'svg' | 'png' | undefined) ?? 'svg';
    const scale = (toolArgs.scale as number | undefined) ?? 1;

    if (!shapeId) {
      throw new Error('shapeId is required for export_shape.');
    }

    const data = await callRelay({
      pairingId,
      platform: 'penpot',
      action: 'export',
      shapeId,
      format,
      scale,
      timeoutMs: 120_000,
    });

    const payload = data as { svg?: string; base64?: string; name?: string; width?: number; height?: number } | null;
    const decodedName = payload?.name ? decodeHtmlEntities(payload.name) : undefined;

    if (format === 'svg') {
      const svgText = payload?.svg;
      if (!svgText) {
        throw new Error('Penpot relay returned empty SVG export data.');
      }

      return {
        content: [{
          type: 'text',
          text: svgText,
          name: decodedName,
          width: payload?.width,
          height: payload?.height,
        }],
      };
    }

    const base64Data = payload?.base64;
    if (!base64Data) {
      throw new Error('Penpot relay returned empty PNG export data.');
    }

    return {
      content: [{
        type: 'image',
        data: base64Data,
        mimeType: 'image/png',
        name: decodedName,
        width: payload?.width,
        height: payload?.height,
      }],
    };
  }

  throw new Error(`Tool "${toolName}" is not supported.`);
}

/**
 * Queries local selection inside the active Figma Desktop App via SyncBridge.
 */
export async function callFigmaSelectionTauri(): Promise<{ id: string; name: string; fileKey: string } | null> {
  if (typeof window === 'undefined' || localStorage.getItem('syncingboard_use_tauri') !== 'true') {
    return null;
  }

  try {
    const res = await fetch('https://local-syncingboard.luiskobayashi.com:4401/detect-figma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      targetAddressSpace: 'loopback',
    } as unknown as RequestInit);

    if (!res.ok) return null;

    const payload = (await res.json()) as { error?: string; data?: { id: string; name: string; fileKey: string } | null };
    return payload.data || null;
  } catch {
    return null;
  }
}
