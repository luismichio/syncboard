import { NextResponse } from 'next/server';
import { blockingDequeuePenpotCommand } from '@/lib/relayRedis';

const LONG_POLL_TIMEOUT_SECONDS = 45;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pairingId = url.searchParams.get('pairingId')?.trim();

    if (!pairingId) {
      return NextResponse.json({ error: 'pairingId is required.' }, { status: 400 });
    }

    const command = await blockingDequeuePenpotCommand(pairingId, LONG_POLL_TIMEOUT_SECONDS);

    return NextResponse.json({
      error: null,
      data: command,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to poll relay commands.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
