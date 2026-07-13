import { NextResponse } from 'next/server';
import { generateAblyTokenRequest } from '@/lib/relayAbly';

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

    const tokenRequest = await generateAblyTokenRequest(pairingId);

    return NextResponse.json({ error: null, tokenRequest });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to generate Ably token.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
