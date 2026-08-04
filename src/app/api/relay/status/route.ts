import { NextResponse } from 'next/server';
import { withRateLimit, COMMUNITY_PLAN } from '@/lib/rate-limit';
import {
  deriveRelayStatusLevel,
  getRelayStatusCountsCached,
  getUserBoardBinding,
} from '@/lib/relayRedis';
import { RELAY_SESSION_EFFECTIVE_LIMIT } from '@/lib/relayRedis';

const USER_ID_HASH_RE = /^[a-f0-9]{64}$/i;

/**
 * Community relay status snapshot for plugin sidebars.
 *
 * Target/source agnostic: counts relay sessions regardless of platform
 * (Figma/Penpot → Miro today; FigJam/Mural later) — one session lease
 * per open destination client, whatever the pairing.
 *
 * Optional identity query: when ?userIdHash=&boardId= are present, the
 * response adds userConflict/activeBoardId so the sidebar can render the
 * 1-board-per-user transfer banner (v0.15.1).
 *
 * Response: { activeSessions, maxSessions, globalSyncsToday, maxGlobalSyncs, status }
 * status ∈ 'available' | 'high_load' | 'full'
 */
async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdHashRaw = searchParams.get('userIdHash') ?? '';
    const boardIdRaw = searchParams.get('boardId') ?? '';
    const userIdHash = USER_ID_HASH_RE.test(userIdHashRaw) ? userIdHashRaw : null;

    // R1: counts are deduped under a 10s SET-NX-EX cache - N concurrent
    // polls cost ~1 Redis recompute per window; the blind 30s client poll
    // is gone (refetch on transitions + on demand instead).
    const counts = await getRelayStatusCountsCached();
    const activeSessions = counts.activeSessions;
    const globalSyncsToday = counts.globalSyncsToday;
    const maxSessions = RELAY_SESSION_EFFECTIVE_LIMIT;

    let userConflict: boolean | undefined;
    let activeBoardId: string | undefined;
    if (userIdHash && boardIdRaw) {
      const binding = await getUserBoardBinding(userIdHash);
      if (binding && binding.boardId !== boardIdRaw) {
        userConflict = true;
        activeBoardId = binding.boardId;
      } else if (binding) {
        userConflict = false;
      }
    }

    return NextResponse.json({
      activeSessions,
      maxSessions,
      globalSyncsToday,
      maxGlobalSyncs: COMMUNITY_PLAN.globalSyncsPerDay,
      status: deriveRelayStatusLevel(activeSessions, maxSessions),
      ...(userConflict === undefined ? {} : { userConflict }),
      ...(activeBoardId ? { activeBoardId } : {}),
    });
  } catch {
    return NextResponse.json(
      { error: 'Relay status store unavailable.' },
      { status: 503 }
    );
  }
}

export const GET = withRateLimit({ endpoint: 'relay:status' })(getHandler);