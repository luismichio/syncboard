import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMUNITY_PLAN } from '@/lib/rate-limit';

// Mock only the Redis-backed data accessors; everything else (the pure
// decision functions, the effective-limit constant) stays real so the route
// logic is exercised end-to-end without a Redis instance.
vi.mock('@/lib/relayRedis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relayRedis')>();
  return {
    ...actual,
    getRelayStatusCountsCached: vi.fn(),
    getUserBoardBinding: vi.fn(),
  };
});

import { GET } from './route';
import {
  deriveRelayStatusLevel,
  getRelayStatusCountsCached,
  getUserBoardBinding,
  RELAY_SESSION_EFFECTIVE_LIMIT,
} from '@/lib/relayRedis';

const VALID_USER_HASH = 'a'.repeat(64);

describe('relay status route', () => {
  beforeEach(() => {
    vi.mocked(getRelayStatusCountsCached).mockReset();
    vi.mocked(getUserBoardBinding).mockReset();
    vi.mocked(getRelayStatusCountsCached).mockResolvedValue({
      activeSessions: 0,
      globalSyncsToday: 0,
    });
    vi.mocked(getUserBoardBinding).mockResolvedValue(null);
  });

  it('reports the community snapshot shape from the cached counts', async () => {
    vi.mocked(getRelayStatusCountsCached).mockResolvedValue({
      activeSessions: 5,
      globalSyncsToday: 12,
    });
    const res = await GET(new Request('http://localhost/api/relay/status'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      activeSessions: 5,
      maxSessions: RELAY_SESSION_EFFECTIVE_LIMIT,
      globalSyncsToday: 12,
      maxGlobalSyncs: COMMUNITY_PLAN.globalSyncsPerDay,
    });
    expect(body.status).toBe(deriveRelayStatusLevel(5, RELAY_SESSION_EFFECTIVE_LIMIT));
    expect(body).not.toHaveProperty('userConflict');
    expect(body).not.toHaveProperty('activeBoardId');
  });

  it('returns 503 when the status store is unavailable', async () => {
    vi.mocked(getRelayStatusCountsCached).mockRejectedValue(new Error('Redis down'));
    const res = await GET(new Request('http://localhost/api/relay/status'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('Relay status store unavailable.');
  });

  it('surfaces the transfer conflict when the binding points at another board', async () => {
    vi.mocked(getUserBoardBinding).mockResolvedValue({
      boardId: 'board-other',
      sessionId: 'sess-1',
      updatedAt: Date.now(),
    });
    const res = await GET(
      new Request(`http://localhost/api/relay/status?userIdHash=${VALID_USER_HASH}&boardId=board-here`)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userConflict?: boolean; activeBoardId?: string };
    expect(body.userConflict).toBe(true);
    expect(body.activeBoardId).toBe('board-other');
  });

  it('omits the activeBoardId when the binding matches the requesting board', async () => {
    vi.mocked(getUserBoardBinding).mockResolvedValue({
      boardId: 'board-here',
      sessionId: 'sess-1',
      updatedAt: Date.now(),
    });
    const res = await GET(
      new Request(`http://localhost/api/relay/status?userIdHash=${VALID_USER_HASH}&boardId=board-here`)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userConflict?: boolean; activeBoardId?: string };
    expect(body.userConflict).toBe(false);
    expect(body).not.toHaveProperty('activeBoardId');
  });

  it('ignores a malformed userIdHash (no Redis lookup, no conflict fields)', async () => {
    const res = await GET(
      new Request('http://localhost/api/relay/status?userIdHash=not-hex&boardId=board-here')
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(getUserBoardBinding)).not.toHaveBeenCalled();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('userConflict');
    expect(body).not.toHaveProperty('activeBoardId');
  });
});
