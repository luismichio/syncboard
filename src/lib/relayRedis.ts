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

export interface RelayRequestBinding {
  pairingId: string;
  platform: 'figma' | 'penpot';
}

export interface MiroRelaySessionLease {
  granted: boolean;
  activeSessions: number;
  retryAfterSeconds: number;
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

const REDIS_TIMEOUT_MS = 10_000;
const MIRO_RELAY_SESSION_TTL_MS = 30 * 60 * 1000;
const MIRO_RELAY_SESSION_LIMIT = parsePositiveInt(
  process.env.RATE_LIMIT_COMMUNITY_MAX_MIRO_RELAY_SESSIONS,
  40
);
const MIRO_RELAY_SESSIONS_KEY = 'relay:miro:sessions';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function runRedisCommand<T>(parts: string[]): Promise<T> {
  const { url, token } = getConfig();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parts),
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

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




function responseKey(requestId: string): string {
  return `relay:response:${requestId}`;
}

function requestBindingKey(requestId: string): string {
  return `relay:request:${requestId}`;
}

export async function storeRelayRequestBinding(
  requestId: string,
  binding: RelayRequestBinding
): Promise<void> {
  await runRedisCommand<string>([
    'SETEX',
    requestBindingKey(requestId),
    '180',
    JSON.stringify(binding),
  ]);
}

export async function getRelayRequestBinding(requestId: string): Promise<RelayRequestBinding | null> {
  const result = await runRedisCommand<string | null>(['GET', requestBindingKey(requestId)]);
  if (!result) return null;

  try {
    const parsed: unknown = JSON.parse(result);
    if (!isRecord(parsed)) return null;
    const pairingId = typeof parsed.pairingId === 'string' ? parsed.pairingId : null;
    const platform = parsed.platform === 'figma' ? 'figma' : parsed.platform === 'penpot' ? 'penpot' : null;
    return pairingId && platform ? { pairingId, platform } : null;
  } catch {
    return null;
  }
}

export async function deleteRelayRequestBinding(requestId: string): Promise<void> {
  await runRedisCommand<number>(['DEL', requestBindingKey(requestId)]);
}

const ACQUIRE_MIRO_RELAY_SESSION_SCRIPT = [
  "local now = tonumber(ARGV[1])",
  "local ttl = tonumber(ARGV[2])",
  "local limit = tonumber(ARGV[3])",
  "local sessionId = ARGV[4]",
  "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - ttl)",
  "if redis.call('ZSCORE', KEYS[1], sessionId) then",
  "  redis.call('ZADD', KEYS[1], now, sessionId)",
  "  redis.call('PEXPIRE', KEYS[1], ttl * 2)",
  "  return {1, redis.call('ZCARD', KEYS[1])}",
  "end",
  "local count = redis.call('ZCARD', KEYS[1])",
  "if count >= limit then return {0, count} end",
  "redis.call('ZADD', KEYS[1], now, sessionId)",
  "redis.call('PEXPIRE', KEYS[1], ttl * 2)",
  "return {1, count + 1}",
].join('\n');

function parseLeaseResult(value: unknown): { granted: boolean; activeSessions: number } {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('Invalid relay session lease response.');
  }
  const granted = Number(value[0]) === 1;
  const activeSessions = Number(value[1]);
  if (!Number.isFinite(activeSessions) || activeSessions < 0) {
    throw new Error('Invalid relay session count.');
  }
  return { granted, activeSessions };
}

export async function acquireMiroRelaySession(sessionId: string): Promise<MiroRelaySessionLease> {
  const result = await runRedisCommand<unknown>([
    'EVAL',
    ACQUIRE_MIRO_RELAY_SESSION_SCRIPT,
    '1',
    MIRO_RELAY_SESSIONS_KEY,
    String(Date.now()),
    String(MIRO_RELAY_SESSION_TTL_MS),
    String(MIRO_RELAY_SESSION_LIMIT),
    sessionId,
  ]);
  const lease = parseLeaseResult(result);
  return {
    ...lease,
    retryAfterSeconds: lease.granted ? 0 : Math.ceil(MIRO_RELAY_SESSION_TTL_MS / 1000),
  };
}

export async function releaseMiroRelaySession(sessionId: string): Promise<void> {
  await runRedisCommand<number>(['ZREM', MIRO_RELAY_SESSIONS_KEY, sessionId]);
}

export async function storeRelayResponse(requestId: string, response: RelayStoredResponse): Promise<void> {
  await runRedisCommand<string>(['SETEX', responseKey(requestId), '180', JSON.stringify(response)]);
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

function oauthStoreKey(state: string): string {
  return `oauth:state:${state.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export async function storeOauthToken(state: string, tokens: unknown): Promise<boolean> {
  const key = oauthStoreKey(state);
  const result = await runRedisCommand<string | null>(['SET', key, JSON.stringify(tokens), 'EX', '300', 'NX']);
  return result === 'OK';
}

export async function getOauthToken(state: string): Promise<unknown | null> {
  const key = oauthStoreKey(state);
  const result = await runRedisCommand<string | null>(['GET', key]);
  if (!result) return null;

  // Consume token once read
  await runRedisCommand<number>(['DEL', key]);

  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}
