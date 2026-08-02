import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import {
  acquireMiroRelaySession,
  releaseMiroRelaySession,
} from '@/lib/relayRedis';

const SESSION_ID_RE = /^[a-f0-9-]{36}$/i;

type SessionAction = 'heartbeat' | 'release';

interface SessionBody {
  sessionId: string;
  action: SessionAction;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBody(value: unknown): SessionBody | null {
  if (!isRecord(value)) return null;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId.trim() : '';
  const action = value.action === 'heartbeat' || value.action === 'release' ? value.action : null;
  return SESSION_ID_RE.test(sessionId) && action ? { sessionId, action } : null;
}

async function handler(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: 'Invalid relay session request.' }, { status: 400 });
  }

  try {
    if (body.action === 'release') {
      await releaseMiroRelaySession(body.sessionId);
      return NextResponse.json({ released: true });
    }

    const lease = await acquireMiroRelaySession(body.sessionId);
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
