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
let activeRelayCalls = 0;
let idleCloseTimer: ReturnType<typeof setTimeout> | null = null;
let sessionHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let relaySessionId: string | null = null;

const RELAY_IDLE_CLOSE_MS = 60_000;
const RELAY_SESSION_HEARTBEAT_MS = 15 * 60_000;

function clearIdleCloseTimer(): void {
  if (idleCloseTimer) {
    clearTimeout(idleCloseTimer);
    idleCloseTimer = null;
  }
}

function getRelaySessionId(): string {
  if (!relaySessionId) {
    relaySessionId = globalThis.crypto.randomUUID();
  }
  return relaySessionId;
}

function stopSessionHeartbeat(): void {
  if (sessionHeartbeatTimer) {
    clearInterval(sessionHeartbeatTimer);
    sessionHeartbeatTimer = null;
  }
}

function sendRelaySessionSignal(action: 'heartbeat' | 'release'): void {
  if (!relaySessionId || typeof window === 'undefined') return;
  void fetch('/api/relay/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: relaySessionId, action }),
    keepalive: action === 'release',
  }).then((response) => {
    if (action === 'heartbeat' && response.status === 429) {
      closeGlobalAblyConnection();
    }
  }).catch(() => {
    // A transient heartbeat failure is retried on the next interval.
  });
}

function startSessionHeartbeat(): void {
  stopSessionHeartbeat();
  sessionHeartbeatTimer = setInterval(() => {
    sendRelaySessionSignal('heartbeat');
  }, RELAY_SESSION_HEARTBEAT_MS);
}

function closeGlobalAblyConnection(): void {
  clearIdleCloseTimer();
  stopSessionHeartbeat();
  const client = globalAblyClient;
  // Clear the singleton first so a synchronous Ably `closed` callback cannot
  // recursively attempt to close the same client.
  globalAblyClient = null;
  globalAblyChannel = null;
  currentConnectedPairingId = null;
  currentConnectedPlatform = null;
  if (client) {
    sendRelaySessionSignal('release');
    try {
      client.close();
    } catch {
      // Ignore stale close errors.
    }
  }
}

function scheduleIdleClose(): void {
  clearIdleCloseTimer();
  if (activeRelayCalls > 0 || !globalAblyClient) return;
  idleCloseTimer = setTimeout(() => {
    if (activeRelayCalls === 0) closeGlobalAblyConnection();
  }, RELAY_IDLE_CLOSE_MS);
}

function invalidateConnection(client: Ably.Realtime): void {
  if (globalAblyClient !== client) return;
  closeGlobalAblyConnection();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', closeGlobalAblyConnection, { once: true });
}

async function getAblyConnection(
  pairingId: string,
  platform: 'figma' | 'penpot' = 'penpot'
): Promise<Ably.RealtimeChannel> {
  clearIdleCloseTimer();
  const prefix = platform === 'figma' ? 'figma' : 'penpot';

  if (
    globalAblyClient &&
    globalAblyChannel &&
    currentConnectedPairingId === pairingId &&
    currentConnectedPlatform === platform
  ) {
    return globalAblyChannel;
  }

  closeGlobalAblyConnection();

  globalAblyClient = new Ably.Realtime({
    authUrl: `/api/ably/token?pairingId=${encodeURIComponent(pairingId)}&platform=${platform}&client=miro&sessionId=${encodeURIComponent(getRelaySessionId())}`,
    authMethod: 'GET',
  });

  globalAblyChannel = globalAblyClient.channels.get(`${prefix}:${pairingId}`);
  currentConnectedPairingId = pairingId;
  currentConnectedPlatform = platform;
  const client = globalAblyClient;
  client.connection.on('failed', () => invalidateConnection(client));
  client.connection.on('suspended', () => invalidateConnection(client));
  client.connection.on('closed', () => invalidateConnection(client));

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Ably connection timed out.')), 10000);

    client.connection.once('connected', () => {
      clearTimeout(timeout);
      resolve();
    });

    client.connection.once('failed', (state) => {
      clearTimeout(timeout);
      reject(new Error(state.reason?.message || 'Ably connection failed'));
    });
  });

  startSessionHeartbeat();
  return globalAblyChannel;
}

export async function callRelay(body: RelayRequestBody): Promise<RelayJson> {
  activeRelayCalls += 1;
  clearIdleCloseTimer();
  try {
    const pairingId = body.pairingId;
    const platform = body.platform || 'penpot';
    const channel = await getAblyConnection(pairingId, platform);
    return await new Promise<RelayJson>((resolve, reject) => {
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
        let fetchRes: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          fetchRes = await fetch(`/api/relay/response?requestId=${targetRequestId}`);
          if (fetchRes.ok || fetchRes.status !== 404 || attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        if (!fetchRes || !fetchRes.ok) {
          const errData = await fetchRes?.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `HTTP ${fetchRes?.status ?? 0}`);
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
  } finally {
    activeRelayCalls = Math.max(0, activeRelayCalls - 1);
    scheduleIdleClose();
  }
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
