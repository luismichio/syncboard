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




function responseKey(requestId: string): string {
  return `relay:response:${requestId}`;
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
