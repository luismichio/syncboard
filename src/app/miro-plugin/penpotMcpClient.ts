export interface PenpotMcpResponse {
  content: { type: string; text?: string; data?: string; mimeType?: string; name?: string; width?: number; height?: number }[];
  isError?: boolean;
}

export type RelayJson = null | boolean | number | string | RelayJson[] | { [key: string]: RelayJson };

export interface RelayRequestBody {
  pairingId: string;
  action: 'select' | 'export';
  shapeId?: string;
  format?: 'svg' | 'png';
  scale?: number;
  timeoutMs?: number;
}

interface RelayResponse {
  error?: string;
  data?: RelayJson;
}

export function getOrCreatePairingId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('syncboard_pairing_id');
  if (!id) {
    // Generate a new ID only if one doesn't exist at all.
    // An empty string means the user explicitly cleared it — don't override.
    if (id === null) {
      try {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        let secureId = 'sb_';
        for (let i = 0; i < 16; i++) {
          secureId += chars[array[i] % chars.length];
        }
        id = secureId;
      } catch {
        id =
          'sb_' +
          Math.random().toString(36).substring(2, 10) +
          Math.random().toString(36).substring(2, 10);
      }
      localStorage.setItem('syncboard_pairing_id', id);
    }
  }
  return id || '';
}



import Ably from 'ably';

let globalAblyClient: Ably.Realtime | null = null;
let globalAblyChannel: any = null;
let currentConnectedPairingId: string | null = null;

async function getAblyConnection(pairingId: string): Promise<any> {
  if (globalAblyClient && currentConnectedPairingId === pairingId && globalAblyChannel) {
    return globalAblyChannel;
  }

  if (globalAblyClient) {
    try {
      globalAblyClient.close();
    } catch (e) {
      // Ignore
    }
    globalAblyClient = null;
    globalAblyChannel = null;
  }

  globalAblyClient = new Ably.Realtime({
    authUrl: `/api/ably/token?pairingId=${encodeURIComponent(pairingId)}`,
    authMethod: 'GET',
  });

  globalAblyChannel = globalAblyClient.channels.get(`penpot:${pairingId}`);
  currentConnectedPairingId = pairingId;

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
  const channel = await getAblyConnection(pairingId);

  const res = await fetch('/api/relay/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      async: true, // Trigger async execution on backend
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as { error?: string; data?: { requestId: string } };
  if (!res.ok || payload.error || !payload.data?.requestId) {
    throw new Error(payload.error || `Relay request failed with HTTP ${res.status}`);
  }

  const requestId = payload.data.requestId;

  return new Promise<RelayJson>((resolve, reject) => {
    let isResolved = false;

    const cleanup = () => {
      isResolved = true;
      try {
        channel.unsubscribe('result', onResult);
        channel.unsubscribe('result-ready', onResultReady);
      } catch (e) {
        // Ignore
      }
      clearTimeout(timeout);
    };

    const timeout = setTimeout(() => {
      if (!isResolved) {
        cleanup();
        reject(new Error('Relay timed out waiting for companion response.'));
      }
    }, body.timeoutMs || 10000);

    const onResult = (msg: any) => {
      if (msg.data?.requestId === requestId) {
        cleanup();
        if (msg.data.error) {
          reject(new Error(msg.data.error));
        } else {
          resolve(msg.data.data ?? null);
        }
      }
    };

    const onResultReady = async (msg: any) => {
      if (msg.data?.requestId === requestId) {
        cleanup();
        try {
          const fetchRes = await fetch(`/api/relay/response?requestId=${requestId}`);
          if (!fetchRes.ok) {
            const errData = await fetchRes.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${fetchRes.status}`);
          }
          const fetchPayload = await fetchRes.json();
          resolve(fetchPayload.data ?? null);
        } catch (fetchErr: any) {
          reject(new Error(`Failed to retrieve relay response: ${fetchErr.message}`));
        }
      }
    };

    channel.subscribe('result', onResult);
    channel.subscribe('result-ready', onResultReady);
  });
}



/**
 * Penpot bridge abstraction:
 * - SyncBridge mode (local HTTPS + Tauri), when enabled in settings.
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



  if (toolName === 'execute_code') {
    const data = await callRelay({
      pairingId,
      action: 'select',
      timeoutMs: 8_000,
    });

    return {
      content: [{
        type: 'text',
        text: data ? JSON.stringify(data) : 'null',
      }],
    };
  }

  if (toolName === 'export_shape') {
    const shapeId = toolArgs.shapeId as string;
    const format = (toolArgs.format as 'svg' | 'png' | undefined) ?? 'svg';
    const scale = (toolArgs.scale as number | undefined) ?? 2;

    if (!shapeId) {
      throw new Error('shapeId is required for export_shape.');
    }

    const data = await callRelay({
      pairingId,
      action: 'export',
      shapeId,
      format,
      scale,
      timeoutMs: 18_000,
    });

    const payload = data as { svg?: string; base64?: string; name?: string; width?: number; height?: number } | null;

    if (format === 'svg') {
      const svgText = payload?.svg;
      if (!svgText) {
        throw new Error('Penpot relay returned empty SVG export data.');
      }
      return { content: [{ type: 'text', text: svgText, name: payload?.name, width: payload?.width, height: payload?.height }] };
    }

    const base64Data = payload?.base64;
    if (!base64Data) {
      throw new Error('Penpot relay returned empty PNG export data.');
    }
    return {
      content: [{ type: 'image', data: base64Data, mimeType: 'image/png', name: payload?.name, width: payload?.width, height: payload?.height }],
    };
  }

  throw new Error(`Tool "${toolName}" is not supported.`);
}

/**
 * Queries local selection inside the active Figma Desktop App via SyncBridge.
 */
export async function callFigmaSelectionTauri(): Promise<{ id: string; name: string; fileKey: string } | null> {
  if (typeof window === 'undefined' || localStorage.getItem('syncboard_use_tauri') !== 'true') {
    return null;
  }

  try {
    const res = await fetch('https://local-syncboard.luiskobayashi.com:4401/detect-figma', {
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
