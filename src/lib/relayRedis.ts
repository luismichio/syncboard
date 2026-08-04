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

export interface RelaySessionLease {
  granted: boolean;
  activeSessions: number;
  retryAfterSeconds: number;
  conflict?: boolean;
  activeBoardId?: string;
}

export interface UserBoardBinding {
  boardId: string;
  sessionId: string;
  updatedAt: number;
}

export type RelayBindingDecision = 'renew' | 'grant' | 'conflict' | 'full';

// Pure decision tables (M5): the Lua script executes the same rules atomically
// server-side. Kept as exported pure functions so the rules are unit-testable
// without a Redis instance.
export function planAcquire(
  binding: UserBoardBinding | null,
  currentBoardId: string,
  activeSessions: number,
  maxSessions: number
): RelayBindingDecision {
  if (binding && binding.boardId !== currentBoardId) return 'conflict';
  if (binding) return 'renew';
  return activeSessions >= maxSessions ? 'full' : 'grant';
}

// Transfer repoints the binding, freeing the previous holder first — so an
// existing binding always yields a grant; only an empty binding respects the cap.
export function planTransfer(
  binding: UserBoardBinding | null,
  activeSessions: number,
  maxSessions: number
): 'grant' | 'full' {
  if (binding) return 'grant';
  return activeSessions >= maxSessions ? 'full' : 'grant';
}

function userBoardBindingKey(userIdHash: string): string {
  return 'relay:user_board:' + userIdHash;
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
const RELAY_SESSION_TTL_MS = 30 * 60 * 1000;
// Arbitrarily large enforcement ceiling for a 0 (= unlimited) pool. Real
// consumer ceilings (free Ably = 200 connections) are far lower, so this is
// never reached in practice; it just keeps the Lua `count >= limit` guard
// from tripping.
const POOL_UNLIMITED = 1_000_000_000;
export const RELAY_SESSION_LIMIT = parsePoolLimit(
  process.env.RATE_LIMIT_COMMUNITY_MAX_RELAY_SESSIONS ??
    process.env.RATE_LIMIT_COMMUNITY_MAX_MIRO_RELAY_SESSIONS,
  40
);
export const RELAY_SESSION_EFFECTIVE_LIMIT =
  RELAY_SESSION_LIMIT === 0 ? POOL_UNLIMITED : RELAY_SESSION_LIMIT;
const RELAY_SESSIONS_KEY = 'relay:sessions';

// Shared pool-limit parser (Miro session pool + companion token pool):
// a value of 0 means UNLIMITED (no cap); invalid/empty falls back.
export function parsePoolLimit(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
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

// Combined acquire/heartbeat/transfer/release script. KEYS[1] = relay:sessions
// (ZSET), KEYS[2] = relay:user_board:{userIdHash} (STRING, 30-min TTL).
// Result codes: {1, count} granted/renewed · {0, count, boardId} conflict ·
// {2, count} full · {3, count} released.
const RELAY_SESSION_SCRIPT = [
  "local now = tonumber(ARGV[1])",
  "local ttl = tonumber(ARGV[2])",
  "local limit = tonumber(ARGV[3])",
  "local sessionId = ARGV[4]",
  "local boardId = ARGV[5]",
  "local userIdHash = ARGV[6]",
  "local action = ARGV[7]",
  "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - ttl)",
  "local bindingBoardId = ''",
  "local bindingSessionId = ''",
  "if userIdHash ~= '' then",
  "  local raw = redis.call('GET', KEYS[2])",
  "  if raw then",
  "    local ok, parsed = pcall(cjson.decode, raw)",
  "    if ok and type(parsed) == 'table' then",
  "      bindingBoardId = tostring(parsed.boardId or '')",
  "      bindingSessionId = tostring(parsed.sessionId or '')",
  "    end",
  "  end",
  "end",
  "if action == 'release' then",
  "  redis.call('ZREM', KEYS[1], sessionId)",
  "  if userIdHash ~= '' and bindingSessionId ~= '' and bindingSessionId == sessionId then",
  "    redis.call('DEL', KEYS[2])",
  "  end",
  "  return {3, redis.call('ZCARD', KEYS[1])}",
  "end",
  "if action == 'transfer' then",
  "  if bindingSessionId ~= '' and bindingSessionId ~= sessionId then",
  "    redis.call('ZREM', KEYS[1], bindingSessionId)",
  "  end",
  "  if redis.call('ZSCORE', KEYS[1], sessionId) == false and redis.call('ZCARD', KEYS[1]) >= limit then",
  "    return {2, redis.call('ZCARD', KEYS[1])}",
  "  end",
  "  redis.call('ZADD', KEYS[1], now, sessionId)",
  "  redis.call('PEXPIRE', KEYS[1], ttl * 2)",
  "  if userIdHash ~= '' then",
  "    redis.call('SET', KEYS[2], cjson.encode({boardId = boardId, sessionId = sessionId, updatedAt = now}), 'PX', ttl)",
  "  end",
  "  return {1, redis.call('ZCARD', KEYS[1])}",
  "end",
  "if userIdHash ~= '' and bindingSessionId ~= '' then",
  "  if bindingBoardId ~= boardId then",
  "    redis.call('ZREM', KEYS[1], sessionId)",
  "    return {0, redis.call('ZCARD', KEYS[1]), bindingBoardId}",
  "  end",
  "  redis.call('ZADD', KEYS[1], now, sessionId)",
  "  redis.call('PEXPIRE', KEYS[1], ttl * 2)",
  "  redis.call('SET', KEYS[2], cjson.encode({boardId = boardId, sessionId = sessionId, updatedAt = now}), 'PX', ttl)",
  "  return {1, redis.call('ZCARD', KEYS[1])}",
  "end",
  "if redis.call('ZSCORE', KEYS[1], sessionId) == false and redis.call('ZCARD', KEYS[1]) >= limit then",
  "  return {2, redis.call('ZCARD', KEYS[1])}",
  "end",
  "redis.call('ZADD', KEYS[1], now, sessionId)",
  "redis.call('PEXPIRE', KEYS[1], ttl * 2)",
  "if userIdHash ~= '' then",
  "  redis.call('SET', KEYS[2], cjson.encode({boardId = boardId, sessionId = sessionId, updatedAt = now}), 'PX', ttl)",
  "end",
  "return {1, redis.call('ZCARD', KEYS[1])}",
].join('\n');

type LeaseResultCode = 0 | 1 | 2 | 3;

function parseLeaseResult(value: unknown): {
  code: LeaseResultCode;
  activeSessions: number;
  activeBoardId: string | null;
} {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('Invalid relay session lease response.');
  }
  const code = Number(value[0]);
  if (code !== 0 && code !== 1 && code !== 2 && code !== 3) {
    throw new Error('Invalid relay session lease result code.');
  }
  const activeSessions = Number(value[1]);
  if (!Number.isFinite(activeSessions) || activeSessions < 0) {
    throw new Error('Invalid relay session count.');
  }
  const activeBoardId = typeof value[2] === 'string' && value[2] !== '' ? value[2] : null;
  return { code, activeSessions, activeBoardId };
}

export interface AcquireSessionOptions {
  sessionId: string;
  userIdHash?: string;
  boardId?: string;
}

export async function acquireRelaySession(options: AcquireSessionOptions): Promise<RelaySessionLease> {
  const result = await runRedisCommand<unknown>([
    'EVAL',
    RELAY_SESSION_SCRIPT,
    '2',
    RELAY_SESSIONS_KEY,
    userBoardBindingKey(options.userIdHash ?? ''),
    String(Date.now()),
    String(RELAY_SESSION_TTL_MS),
    String(RELAY_SESSION_EFFECTIVE_LIMIT),
    options.sessionId,
    options.boardId ?? '',
    options.userIdHash ?? '',
    'heartbeat',
  ]);
  const lease = parseLeaseResult(result);
  if (lease.code === 0) {
    return {
      granted: false,
      activeSessions: lease.activeSessions,
      retryAfterSeconds: 0,
      conflict: true,
      activeBoardId: lease.activeBoardId ?? undefined,
    };
  }
  if (lease.code === 2) {
    return {
      granted: false,
      activeSessions: lease.activeSessions,
      retryAfterSeconds: Math.ceil(RELAY_SESSION_TTL_MS / 1000),
    };
  }
  return {
    granted: true,
    activeSessions: lease.activeSessions,
    retryAfterSeconds: 0,
  };
}

export async function transferRelaySession(options: AcquireSessionOptions): Promise<RelaySessionLease> {
  const result = await runRedisCommand<unknown>([
    'EVAL',
    RELAY_SESSION_SCRIPT,
    '2',
    RELAY_SESSIONS_KEY,
    userBoardBindingKey(options.userIdHash ?? ''),
    String(Date.now()),
    String(RELAY_SESSION_TTL_MS),
    String(RELAY_SESSION_EFFECTIVE_LIMIT),
    options.sessionId,
    options.boardId ?? '',
    options.userIdHash ?? '',
    'transfer',
  ]);
  const lease = parseLeaseResult(result);
  if (lease.code === 2) {
    return {
      granted: false,
      activeSessions: lease.activeSessions,
      retryAfterSeconds: Math.ceil(RELAY_SESSION_TTL_MS / 1000),
    };
  }
  return {
    granted: true,
    activeSessions: lease.activeSessions,
    retryAfterSeconds: 0,
  };
}

export async function releaseRelaySession(sessionId: string, userIdHash?: string): Promise<void> {
  await runRedisCommand<unknown>([
    'EVAL',
    RELAY_SESSION_SCRIPT,
    '2',
    RELAY_SESSIONS_KEY,
    userBoardBindingKey(userIdHash ?? ''),
    String(Date.now()),
    String(RELAY_SESSION_TTL_MS),
    String(RELAY_SESSION_EFFECTIVE_LIMIT),
    sessionId,
    '',
    userIdHash ?? '',
    'release',
  ]);
}

export async function getUserBoardBinding(userIdHash: string): Promise<UserBoardBinding | null> {
  const result = await runRedisCommand<string | null>(['GET', userBoardBindingKey(userIdHash)]);
  if (!result) return null;
  try {
    const parsed: unknown = JSON.parse(result);
    if (!isRecord(parsed)) return null;
    const boardId = typeof parsed.boardId === 'string' ? parsed.boardId : null;
    const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId : null;
    const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null;
    return boardId && sessionId && typeof updatedAt === 'number'
      ? { boardId, sessionId, updatedAt }
      : null;
  } catch {
    return null;
  }
}

export interface RelaySessionStatus {
  activeSessions: number;
  maxSessions: number;
}

export type RelayStatusLevel = 'available' | 'high_load' | 'full';

// High load begins at 75% of the ceiling (30 of 40), full at the ceiling.
export function deriveRelayStatusLevel(
  activeSessions: number,
  maxSessions: number
): RelayStatusLevel {
  if (maxSessions <= 0) return 'available'; // 0 = unlimited pool
  if (activeSessions >= maxSessions) return 'full';
  const highLoadFrom = Math.ceil(maxSessions * 0.75);
  return activeSessions >= highLoadFrom ? 'high_load' : 'available';
}

// Read-only snapshot of the active-session ZSET, counting only leases younger
// than the session TTL (mirrors the acquire-prune behavior).
export async function getRelaySessionStatus(): Promise<RelaySessionStatus> {
  const activeSessions = await runRedisCommand<number>([
    'ZCOUNT',
    RELAY_SESSIONS_KEY,
    `(${Date.now() - RELAY_SESSION_TTL_MS}`,
    '+inf',
  ]);
  return { activeSessions, maxSessions: RELAY_SESSION_EFFECTIVE_LIMIT };
}

const GLOBAL_SYNC_COUNTER_KEY = 'relay:counters:global_syncs_today';
const GLOBAL_SYNC_INCREMENT_SCRIPT = [
  "local c = redis.call('INCR', KEYS[1])",
  "if c == 1 then redis.call('EXPIRE', KEYS[1], 86400) end",
  'return c',
].join('\n');

// Best-effort display counter incremented alongside the daily global backstop,
// so /api/relay/status can surface 'syncs today' without replicating the
// sliding-window ratelimit key format.
export async function incrementGlobalSyncCount(): Promise<number> {
  const result = await runRedisCommand<number>([
    'EVAL',
    GLOBAL_SYNC_INCREMENT_SCRIPT,
    '1',
    GLOBAL_SYNC_COUNTER_KEY,
  ]);
  return typeof result === 'number' && Number.isFinite(result) ? result : 0;
}

export async function getGlobalSyncCount(): Promise<number | null> {
  try {
    const result = await runRedisCommand<string | null>(['GET', GLOBAL_SYNC_COUNTER_KEY]);
    if (result === null || result === '') return null;
    const parsed = Number(result);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

// ─── Companion token cap (A1/A2) & 1-tab-per-pairing (Design B) ────────────
// Companions are the *persistent* Ably consumers (one socket each); Miro
// sidebars are transient (30s idle close). The cap therefore bounds
// companions at RATE_LIMIT_COMMUNITY_MAX_COMPANION_TOKENS (default 180),
// leaving 20 Ably connections of the free 200 for concurrent Miro detectors.
const COMPANION_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2h — matches the Ably token TTL
const COMPANION_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // refreshed at every token issuance
const COMPANION_TOKEN_LIMIT = parsePoolLimit(
  process.env.RATE_LIMIT_COMMUNITY_MAX_COMPANION_TOKENS,
  180
);
const COMPANION_TOKEN_EFFECTIVE_LIMIT =
  COMPANION_TOKEN_LIMIT === 0 ? POOL_UNLIMITED : COMPANION_TOKEN_LIMIT;
const ACTIVE_COMPANION_TOKENS_KEY = 'relay:active_companion_tokens';
const MIRO_PAIRING_TTL_MS = RELAY_SESSION_TTL_MS; // mirrors the lease TTL
function companionSessionKey(pairingId: string): string {
  return `relay:companion_session:${pairingId}`;
}
function miroPairingKey(pairingId: string): string {
  return `relay:miro_pairing:${pairingId}`;
}
export interface CompanionSessionBinding {
  tabId: string;
  platform: 'figma' | 'penpot';
  connectedAt: number;
}
export interface CompanionTokenCandidate {
  pairingId: string;
  connectedAt: number;
  hasActiveMiroPairing: boolean;
}
export interface CompanionTokenAcquisition {
  granted: boolean;
  count: number;
  evictedPairingId: string | null;
  retryAfterSeconds: number;
}
/**
 * A2: eviction selection (pure). Never evict a companion whose pairing has a
 * live Miro lease (active pair); among orphans pick the OLDEST. Returns null
 * when nothing can be evicted — the requester must wait (Retry-After), never
 * a forced eviction of an active pair.
 */
export function selectEvictionCandidate(
  companions: CompanionTokenCandidate[]
): string | null {
  const orphans = companions
    .filter((c) => !c.hasActiveMiroPairing)
    .sort((a, b) => a.connectedAt - b.connectedAt);
  return orphans.length > 0 ? orphans[0].pairingId : null;
}
/**
 * A1 + A2 decision mirror of ACQUIRE_COMPANION_TOKEN_SCRIPT. Pure JS so the
 * Lua semantics are unit-testable without a Redis instance.
 */
export function planCompanionTokenAcquisition(
  now: number,
  members: CompanionTokenCandidate[],
  cap: number,
  requestingPairingId: string
): { decision: 'grant' | 'full'; evictedPairingId: string | null } {
  const alreadyPresent = members.some((m) => m.pairingId === requestingPairingId);
  if (!alreadyPresent && members.length >= cap) {
    const evicted = selectEvictionCandidate(members);
    if (!evicted) return { decision: 'full', evictedPairingId: null };
    return { decision: 'grant', evictedPairingId: evicted };
  }
  return { decision: 'grant', evictedPairingId: null };
}
/**
 * Design B: 1 tab per pairing. A second tab with the same pairingId conflicts
 * unless the binding already belongs to this tabId (refresh path).
 */
export function planCompanionBinding(
  binding: CompanionSessionBinding | null,
  tabId: string
): 'grant' | 'conflict' {
  if (binding && binding.tabId !== tabId) return 'conflict';
  return 'grant';
}
// KEYS[1] = relay:active_companion_tokens (ZSET, score = connectedAt ms)
// ARGV[1] = now ms, ARGV[2] = token TTL ms, ARGV[3] = cap, ARGV[4] = pairingId
// Result: {1, count, evicted} granted · {0, count, ''} full (nothing evictable)
const ACQUIRE_COMPANION_TOKEN_SCRIPT = [
  "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]) - tonumber(ARGV[2]))",
  "local cap = tonumber(ARGV[3])",
  "local pairingId = ARGV[4]",
  "local count = redis.call('ZCARD', KEYS[1])",
  "local evicted = ''",
  "if redis.call('ZSCORE', KEYS[1], pairingId) == false and count >= cap then",
  "  local members = redis.call('ZRANGE', KEYS[1], 0, -1)",
  "  for _, pid in ipairs(members) do",
  "    if redis.call('EXISTS', 'relay:miro_pairing:' .. pid) == 0 then",
  "      redis.call('ZREM', KEYS[1], pid)",
  "      evicted = pid",
  "      break",
  "    end",
  "  end",
  "  if evicted == '' then",
  "    return {0, count, ''}",
  "  end",
  "end",
  "redis.call('ZADD', KEYS[1], tonumber(ARGV[1]), pairingId)",
  "redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]) * 2)",
  "return {1, redis.call('ZCARD', KEYS[1]), evicted}",
].join('\n');
export async function acquireCompanionToken(
  pairingId: string
): Promise<CompanionTokenAcquisition> {
  const result = await runRedisCommand<unknown>([
    'EVAL',
    ACQUIRE_COMPANION_TOKEN_SCRIPT,
    '1',
    ACTIVE_COMPANION_TOKENS_KEY,
    String(Date.now()),
    String(COMPANION_TOKEN_TTL_MS),
    String(COMPANION_TOKEN_EFFECTIVE_LIMIT),
    pairingId,
  ]);
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error('Invalid companion token acquisition response.');
  }
  const granted = Number(result[0]) === 1;
  const count = Number(result[1]);
  const evictedPairingId =
    typeof result[2] === 'string' && result[2] !== '' ? result[2] : null;
  return {
    granted,
    count: Number.isFinite(count) && count >= 0 ? count : 0,
    evictedPairingId,
    retryAfterSeconds: granted
      ? 0
      : Math.ceil(COMPANION_TOKEN_TTL_MS / 1000),
  };
}
export async function releaseCompanionToken(pairingId: string): Promise<void> {
  await runRedisCommand<number>(['ZREM', ACTIVE_COMPANION_TOKENS_KEY, pairingId]).catch(() => 0);
}
export async function setCompanionSession(
  pairingId: string,
  binding: CompanionSessionBinding
): Promise<void> {
  await runRedisCommand<string>([
    'SETEX',
    companionSessionKey(pairingId),
    String(Math.ceil(COMPANION_SESSION_TTL_MS / 1000)),
    JSON.stringify(binding),
  ]);
}
export async function getCompanionSession(
  pairingId: string
): Promise<CompanionSessionBinding | null> {
  const raw = await runRedisCommand<string | null>(['GET', companionSessionKey(pairingId)]);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const tabId = typeof parsed.tabId === 'string' ? parsed.tabId : '';
    const platform =
      parsed.platform === 'figma' ? 'figma' : parsed.platform === 'penpot' ? 'penpot' : null;
    const connectedAt = typeof parsed.connectedAt === 'number' ? parsed.connectedAt : Date.now();
    return tabId && platform ? { tabId, platform, connectedAt } : null;
  } catch {
    return null;
  }
}
/**
 * Release the companion binding + token slot. Only the holder tab can release
 * (a stale tab cannot free another tab's live session).
 */
export async function releaseCompanionSession(
  pairingId: string,
  tabId: string
): Promise<boolean> {
  const binding = await getCompanionSession(pairingId);
  if (binding && binding.tabId !== tabId) return false;
  await runRedisCommand<number>(['DEL', companionSessionKey(pairingId)]).catch(() => 0);
  await releaseCompanionToken(pairingId).catch(() => undefined);
  return true;
}
/**
 * Transfer the binding to a new tab. Returns the previous holder (for the
 * retire broadcast) or null when this tab already holds it / no prior holder.
 */
export async function transferCompanionSession(
  pairingId: string,
  newTabId: string,
  platform: 'figma' | 'penpot'
): Promise<CompanionSessionBinding | null> {
  const previous = await getCompanionSession(pairingId);
  await setCompanionSession(pairingId, {
    tabId: newTabId,
    platform,
    connectedAt: Date.now(),
  });
  return previous && previous.tabId !== newTabId ? previous : null;
}
// A2 orphan mirror: a live Miro lease for the pairing keeps the companion
// 'active' so orphan eviction never starves a pairing someone is listening to.
export async function markMiroPairingActive(pairingId: string): Promise<void> {
  await runRedisCommand<string>([
    'SET',
    miroPairingKey(pairingId),
    String(Date.now()),
    'PX',
    String(MIRO_PAIRING_TTL_MS),
  ]).catch(() => undefined);
}
export async function clearMiroPairing(pairingId: string): Promise<void> {
  await runRedisCommand<number>(['DEL', miroPairingKey(pairingId)]).catch(() => 0);
}

// ─── R1: status-count dedupe (SET NX EX 10s recompute gate) ───────────────
const RELAY_STATUS_CACHE_KEY = 'relay:status_cache';
const RELAY_STATUS_CACHE_TTL_SECONDS = 10;
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export interface RelayStatusCounts {
  activeSessions: number;
  globalSyncsToday: number | null;
}
function parseStatusCounts(raw: string | null): RelayStatusCounts | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const activeSessions = typeof parsed.activeSessions === 'number' ? parsed.activeSessions : null;
    const globalSyncsToday =
      typeof parsed.globalSyncsToday === 'number' ? parsed.globalSyncsToday : null;
    return typeof activeSessions === 'number' ? { activeSessions, globalSyncsToday } : null;
  } catch {
    return null;
  }
}
async function recomputeRelayStatusCounts(): Promise<RelayStatusCounts> {
  const [activeSessions, globalSyncsToday] = await Promise.all([
    getRelaySessionStatus().then((s) => s.activeSessions).catch(() => 0),
    getGlobalSyncCount().catch(() => null),
  ]);
  return { activeSessions, globalSyncsToday };
}
/**
 * R1: N concurrent polls cost ~1 recompute per 10s window. The dedupe key is
 * Redis-side, so it works across serverless instances.
 */
export async function getRelayStatusCountsCached(): Promise<RelayStatusCounts> {
  const cached = parseStatusCounts(
    await runRedisCommand<string | null>(['GET', RELAY_STATUS_CACHE_KEY])
  );
  if (cached) return cached;
  const claimed = await runRedisCommand<string | null>([
    'SET',
    RELAY_STATUS_CACHE_KEY,
    '1',
    'EX',
    String(RELAY_STATUS_CACHE_TTL_SECONDS),
    'NX',
  ]);
  if (claimed !== 'OK') {
    // Another instance is recomputing — wait briefly, then reuse if available.
    await sleep(150);
    const retried = parseStatusCounts(
      await runRedisCommand<string | null>(['GET', RELAY_STATUS_CACHE_KEY])
    );
    if (retried) return retried;
  }
  const counts = await recomputeRelayStatusCounts();
  await runRedisCommand<string>([
    'SETEX',
    RELAY_STATUS_CACHE_KEY,
    String(RELAY_STATUS_CACHE_TTL_SECONDS),
    JSON.stringify(counts),
  ]).catch(() => undefined);
  return counts;
}
