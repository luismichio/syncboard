import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { storeOauthToken, getOauthToken } from '@/lib/relayRedis';

const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;

interface StoredTokenPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  teamId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeState(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!STATE_RE.test(value)) return null;
  return value;
}

function normalizeStoredTokenPayload(value: unknown): StoredTokenPayload | null {
  if (!isRecord(value)) return null;

  const accessToken = typeof value.accessToken === 'string' ? value.accessToken.trim() : '';
  const refreshToken = typeof value.refreshToken === 'string' ? value.refreshToken : '';
  const expiresAt = typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
    ? value.expiresAt
    : NaN;
  const teamId = typeof value.teamId === 'string' ? value.teamId : undefined;

  if (!accessToken) return null;
  if (!Number.isFinite(expiresAt)) return null;

  return {
    accessToken,
    refreshToken,
    expiresAt,
    teamId,
  };
}

async function getHandler(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = normalizeState(searchParams.get('state'));

  if (!state) {
    return NextResponse.json({ error: 'Invalid or missing state parameter' }, { status: 400 });
  }

  try {
    const tokens = normalizeStoredTokenPayload(await getOauthToken(state));
    if (tokens) {
      return NextResponse.json({ status: 'success', tokens });
    }

    return NextResponse.json({ status: 'pending' });
  } catch {
    return NextResponse.json({ error: 'OAuth token store unavailable' }, { status: 500 });
  }
}

async function postHandler(request: Request) {
  try {
    const rawBody: unknown = await request.json();
    if (!isRecord(rawBody)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const state = normalizeState(typeof rawBody.state === 'string' ? rawBody.state : null);
    if (!state) {
      return NextResponse.json({ error: 'Invalid or missing state' }, { status: 400 });
    }

    const normalizedTokens = normalizeStoredTokenPayload(rawBody.tokens);
    if (!normalizedTokens) {
      return NextResponse.json({ error: 'Invalid token payload' }, { status: 400 });
    }

    const stored = await storeOauthToken(state, normalizedTokens);
    if (!stored) {
      return NextResponse.json({ error: 'OAuth state already consumed or expired' }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid payload or server error' }, { status: 400 });
  }
}

export const GET = withRateLimit({ endpoint: 'oauth:store:get' })(getHandler);
export const POST = withRateLimit({ endpoint: 'oauth:store:post' })(postHandler);
