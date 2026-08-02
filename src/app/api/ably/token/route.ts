import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import {
  acquireMiroRelaySession,
  releaseMiroRelaySession,
} from '@/lib/relayRedis';
import { generateAblyToken, RelayTokenRole } from '@/lib/relayAbly';

const PAIRING_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const SESSION_ID_RE = /^[a-f0-9-]{36}$/i;

type Platform = 'figma' | 'penpot';

interface TokenRequestInput {
  pairingId: string;
  platform: Platform;
  role: RelayTokenRole;
  sessionId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseInput(raw: Record<string, unknown>): TokenRequestInput | null {
  const pairingId = typeof raw.pairingId === 'string' ? raw.pairingId.trim() : '';
  const platform: Platform = raw.platform === 'figma' ? 'figma' : 'penpot';
  const role: RelayTokenRole = raw.client === 'miro' ? 'miro' : 'companion';
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : undefined;

  if (!PAIRING_ID_RE.test(pairingId)) return null;
  if (role === 'miro' && (!sessionId || !SESSION_ID_RE.test(sessionId))) return null;
  return { pairingId, platform, role, sessionId };
}

async function issueToken(input: TokenRequestInput): Promise<NextResponse> {
  const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  let acquiredMiroLease = false;
  if (input.role === 'miro' && hasRedis) {
    const lease = await acquireMiroRelaySession(input.sessionId!);
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
      await releaseMiroRelaySession(input.sessionId!).catch(() => undefined);
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
