import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import {
  acquireRelaySession,
  releaseRelaySession,
} from '@/lib/relayRedis';
import { generateAblyToken, RelayTokenRole } from '@/lib/relayAbly';

const PAIRING_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const SESSION_ID_RE = /^[a-f0-9-]{36}$/i;
const USER_ID_HASH_RE = /^[a-f0-9]{64}$/i;

type Platform = 'figma' | 'penpot';

interface TokenRequestInput {
  pairingId: string;
  platform: Platform;
  role: RelayTokenRole;
  sessionId?: string;
  userIdHash?: string;
  boardId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseInput(raw: Record<string, unknown>): TokenRequestInput | null {
  const pairingId = typeof raw.pairingId === 'string' ? raw.pairingId.trim() : '';
  const platform: Platform = raw.platform === 'figma' ? 'figma' : 'penpot';
  const role: RelayTokenRole = raw.client === 'miro' ? 'miro' : 'companion';
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : undefined;
  const userIdHashRaw = typeof raw.userIdHash === 'string' ? raw.userIdHash.trim() : '';
  const boardIdRaw = typeof raw.boardId === 'string' ? raw.boardId.trim() : '';

  if (!PAIRING_ID_RE.test(pairingId)) return null;
  if (role === 'miro' && (!sessionId || !SESSION_ID_RE.test(sessionId))) return null;
  if (userIdHashRaw && !USER_ID_HASH_RE.test(userIdHashRaw)) return null;
  return {
    pairingId,
    platform,
    role,
    sessionId,
    userIdHash: userIdHashRaw || undefined,
    boardId: boardIdRaw || undefined,
  };
}

async function issueToken(input: TokenRequestInput): Promise<NextResponse> {
  const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  let acquiredMiroLease = false;
  if (input.role === 'miro' && hasRedis) {
    const lease = await acquireRelaySession({
      sessionId: input.sessionId!,
      userIdHash: input.userIdHash,
      boardId: input.boardId,
    });
    if (lease.conflict) {
      // Same user's other board holds the binding: surface the transfer
      // banner instead of a failed connection (distinct from capacity 429).
      return NextResponse.json({
        error: 'relay_conflict',
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
    acquiredMiroLease = true;
  }

  try {
    const tokenDetails = await generateAblyToken(
      input.pairingId,
      input.platform,
      input.role,
      input.sessionId
    );
    return NextResponse.json(tokenDetails);
  } catch (error) {
    if (acquiredMiroLease) {
      await releaseRelaySession(input.sessionId!, input.userIdHash).catch(() => undefined);
    }
    throw error;
  }
}

async function postHandler(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const input = parseInput(isRecord(body) ? body : {});
    if (!input) {
      return NextResponse.json({ error: 'Invalid pairingId or Miro session ID.' }, { status: 400 });
    }
    return await issueToken(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate Ably token.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const input = parseInput({
      pairingId: searchParams.get('pairingId'),
      platform: searchParams.get('platform'),
      client: searchParams.get('client'),
      sessionId: searchParams.get('sessionId'),
      userIdHash: searchParams.get('userIdHash'),
      boardId: searchParams.get('boardId'),
    });
    if (!input) {
      return NextResponse.json({ error: 'Invalid pairingId or Miro session ID.' }, { status: 400 });
    }
    return await issueToken(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate Ably token.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withRateLimit({ endpoint: 'ably:token' })(postHandler);
export const GET = withRateLimit({ endpoint: 'ably:token' })(getHandler);