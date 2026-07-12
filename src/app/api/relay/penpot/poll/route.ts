import { NextResponse } from 'next/server';
import { dequeuePenpotCommand, markPenpotPresence } from '@/lib/relayRedis';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pairingId = url.searchParams.get('pairingId')?.trim();

    if (!pairingId) {
      return NextResponse.json({ error: 'pairingId is required.' }, { status: 400 });
    }

    await markPenpotPresence(pairingId);
    const command = await dequeuePenpotCommand(pairingId);

    return NextResponse.json({
      error: null,
      data: command,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to poll relay commands.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
