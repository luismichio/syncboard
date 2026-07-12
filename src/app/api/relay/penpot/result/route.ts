import { NextResponse } from 'next/server';
import { RelayJson, storeRelayResponse } from '@/lib/relayRedis';

interface ResultBody {
  requestId?: string;
  data?: RelayJson;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResultBody;
    const requestId = body.requestId?.trim();

    if (!requestId) {
      return NextResponse.json({ error: 'requestId is required.' }, { status: 400 });
    }

    await storeRelayResponse(requestId, {
      data: body.data ?? null,
      error: body.error,
    });

    return NextResponse.json({
      error: null,
      data: { status: 'ok' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit relay response.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
