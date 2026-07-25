import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { generateAblyToken } from '@/lib/relayAbly';

async function postHandler(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const pairingId = typeof raw.pairingId === 'string' ? raw.pairingId.trim() : null;
    const platform = raw.platform === 'figma' ? 'figma' : 'penpot';

    if (!pairingId) {
      return NextResponse.json(
        { error: 'pairingId is required.' },
        { status: 400 }
      );
    }

    const tokenDetails = await generateAblyToken(pairingId, platform);

    return NextResponse.json(tokenDetails);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to generate Ably token.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function getHandler(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pairingId = searchParams.get('pairingId');
    const platformParam = searchParams.get('platform');
    const platform = platformParam === 'figma' ? 'figma' : 'penpot';

    if (!pairingId) {
      return NextResponse.json(
        { error: 'pairingId query parameter is required.' },
        { status: 400 }
      );
    }

    const trimmed = pairingId.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: 'pairingId must not be empty.' },
        { status: 400 }
      );
    }

    const tokenDetails = await generateAblyToken(trimmed, platform);

    return NextResponse.json(tokenDetails);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to generate Ably token.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withRateLimit({ endpoint: "ably:token" })(postHandler);
export const GET = withRateLimit({ endpoint: "ably:token" })(getHandler);
