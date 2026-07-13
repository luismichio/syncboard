export type RelayJson =
  | null
  | boolean
  | number
  | string
  | RelayJson[]
  | { [key: string]: RelayJson };

export interface RelayCommand {
  id: string;
  action: 'select' | 'export';
  createdAt: number;
  shapeId?: string;
  format?: 'svg' | 'png';
  scale?: number;
}

export interface RelayStoredResponse {
  data: RelayJson | null;
  error?: string;
}

function getConfig(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error('Relay store is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  }

  return { url, token };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function runRedisCommand<T>(parts: string[]): Promise<T> {
  const { url, token } = getConfig();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parts),
    cache: 'no-store',
  });

  const payloadUnknown: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = isRecord(payloadUnknown) && typeof payloadUnknown.error === 'string'
      ? payloadUnknown.error
      : `Redis command failed with HTTP ${response.status}`;
    throw new Error(msg);
  }

  if (!isRecord(payloadUnknown)) {
    throw new Error('Invalid Redis response payload.');
  }

  if (typeof payloadUnknown.error === 'string') {
    throw new Error(payloadUnknown.error);
  }

  return payloadUnknown.result as T;
}

function sanitizePairingId(pairingId: string): string {
  const sanitized = pairingId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sanitized) {
    throw new Error('Invalid pairingId.');
  }
  return sanitized;
}

function commandQueueKey(pairingId: string): string {
  return `relay:penpot:${sanitizePairingId(pairingId)}:cmd`;
}

function presenceKey(pairingId: string): string {
  return `relay:penpot:${sanitizePairingId(pairingId)}:presence`;
}

function responseKey(requestId: string): string {
  return `relay:response:${requestId}`;
}

export async function markPenpotPresence(pairingId: string): Promise<void> {
  const key = presenceKey(pairingId);
  await runRedisCommand<string>(['SETEX', key, '120', Date.now().toString()]);
}

// Command delivery now uses Ably WebSocket (relayAbly.ts).
// The poll/blocking dequeue is preserved as a fallback for non-Ably clients.

function parseRelayCommand(raw: string): RelayCommand | null {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    return null;
  }

  if (typeof parsed.id !== 'string' || (parsed.action !== 'select' && parsed.action !== 'export')) {
    return null;
  }

  const command: RelayCommand = {
    id: parsed.id,
    action: parsed.action,
    createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
  };

  if (typeof parsed.shapeId === 'string') {
    command.shapeId = parsed.shapeId;
  }
  if (parsed.format === 'svg' || parsed.format === 'png') {
    command.format = parsed.format;
  }
  if (typeof parsed.scale === 'number') {
    command.scale = parsed.scale;
  }

  return command;
}

export async function blockingDequeuePenpotCommand(
  pairingId: string,
  timeoutSeconds: number
): Promise<RelayCommand | null> {
  const key = commandQueueKey(pairingId);
  const clampedTimeout = Math.max(1, Math.min(55, Math.floor(timeoutSeconds)));
  const result = await runRedisCommand<[string, string] | null>(['BRPOP', key, String(clampedTimeout)]);

  if (!result || !Array.isArray(result) || typeof result[1] !== 'string') {
    return null;
  }

  return parseRelayCommand(result[1]);
}

export async function storeRelayResponse(requestId: string, response: RelayStoredResponse): Promise<void> {
  await runRedisCommand<string>(['SETEX', responseKey(requestId), '45', JSON.stringify(response)]);
}

export async function getRelayResponse(requestId: string): Promise<RelayStoredResponse | null> {
  const result = await runRedisCommand<string | null>(['GET', responseKey(requestId)]);

  if (!result) {
    return null;
  }

  const parsed: unknown = JSON.parse(result);
  if (!isRecord(parsed)) {
    return null;
  }

  const dataRaw = parsed.data as RelayJson | undefined;
  const errorRaw = typeof parsed.error === 'string' ? parsed.error : undefined;

  return {
    data: dataRaw ?? null,
    error: errorRaw,
  };
}

export async function deleteRelayResponse(requestId: string): Promise<void> {
  await runRedisCommand<number>(['DEL', responseKey(requestId)]);
}
