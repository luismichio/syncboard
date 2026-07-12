import { NextResponse } from 'next/server';
import { markPenpotPresence } from '@/lib/relayRedis';

interface RegisterBody {
  pairingId?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterBody;
    const pairingId = body.pairingId?.trim();

    if (!pairingId) {
      return NextResponse.json({ error: 'pairingId is required.' }, { status: 400 });
    }

    await markPenpotPresence(pairingId);

    return NextResponse.json({
      error: null,
      data: { status: 'registered' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to register Penpot relay client.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
