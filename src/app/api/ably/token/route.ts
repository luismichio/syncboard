import { NextRequest, NextResponse } from 'next/server';
import { generateAblyToken } from '@/lib/relayAbly';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const pairingId =
      body && typeof body === 'object' && 'pairingId' in body
        ? String((body as { pairingId: string }).pairingId).trim()
        : null;

    if (!pairingId) {
      return NextResponse.json(
        { error: 'pairingId is required.' },
        { status: 400 }
      );
    }

    const tokenDetails = await generateAblyToken(pairingId);

    return NextResponse.json(tokenDetails);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to generate Ably token.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET handler for Ably authUrl (returns TokenDetails directly) */
export async function GET(request: NextRequest) {
  try {
    const pairingId = request.nextUrl.searchParams.get('pairingId');

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

    const tokenDetails = await generateAblyToken(trimmed);

    return NextResponse.json(tokenDetails);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to generate Ably token.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
