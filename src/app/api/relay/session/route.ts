import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import {
  acquireRelaySession,
  releaseRelaySession,
  transferRelaySession,
} from '@/lib/relayRedis';

const SESSION_ID_RE = /^[a-f0-9-]{36}$/i;
const USER_ID_HASH_RE = /^[a-f0-9]{64}$/i;

type SessionAction = 'heartbeat' | 'release' | 'transfer';

interface SessionBody {
  sessionId: string;
  action: SessionAction;
  userIdHash?: string;
  boardId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBody(value: unknown): SessionBody | null {
  if (!isRecord(value)) return null;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId.trim() : '';
  const action =
    value.action === 'heartbeat' || value.action === 'release' || value.action === 'transfer'
      ? value.action
      : null;
  if (!SESSION_ID_RE.test(sessionId) || !action) return null;
  const userIdHashRaw = typeof value.userIdHash === 'string' ? value.userIdHash.trim() : '';
  const boardIdRaw = typeof value.boardId === 'string' ? value.boardId.trim() : '';
  if (userIdHashRaw && !USER_ID_HASH_RE.test(userIdHashRaw)) return null;
  const userIdHash = userIdHashRaw || undefined;
  const boardId = boardIdRaw || undefined;
  // Transfer needs identity + board to repoint the per-user binding.
  if (action === 'transfer' && (!userIdHash || !boardId)) return null;
  return { sessionId, action, userIdHash, boardId };
}

async function handler(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: 'Invalid relay session request.' }, { status: 400 });
  }

  try {
    if (body.action === 'release') {
      await releaseRelaySession(body.sessionId, body.userIdHash);
      return NextResponse.json({ released: true });
    }

    const options = {
      sessionId: body.sessionId,
      userIdHash: body.userIdHash,
      boardId: body.boardId,
    };
    const lease =
      body.action === 'transfer'
        ? await transferRelaySession(options)
        : await acquireRelaySession(options);

    if (lease.conflict) {
      // Same user, different board: the slot is held by the user's other board.
      // Not a capacity error, so return 200 (no Retry-After).
      return NextResponse.json({
        granted: false,
        conflict: true,
        activeBoardId: lease.activeBoardId,
        activeSessions: lease.activeSessions,
      });
    }

    if (!lease.granted) {
      return NextResponse.json(
        {
          error: 'relay_capacity_reached',
          activeSessions: lease.activeSessions,
          retryAfter: lease.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(lease.retryAfterSeconds) },
        }
      );
    }

    return NextResponse.json({
      granted: true,
      activeSessions: lease.activeSessions,
    });
  } catch {
    return NextResponse.json({ error: 'Relay session store unavailable.' }, { status: 503 });
  }
}

export const POST = withRateLimit({ endpoint: 'relay:session' })(handler);