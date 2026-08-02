import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import {
  deleteRelayRequestBinding,
  deleteRelayResponse,
  getRelayResponse,
} from '@/lib/relayRedis';

const REQUEST_ID_RE = /^req_[a-f0-9]{32}$/;

/**
 * GET /api/relay/response
 *
 * Single-read retrieval endpoint for event-driven relay architecture.
 * Miro calls this once notified via Ably WebSocket that the result is ready.
 * Fetches the result from Redis and immediately deletes it to clean up.
 *
 * Query Params: ?requestId=req_xxx
 */
async function handler(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId')?.trim();

    if (!requestId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: requestId' },
        { status: 400 }
      );
    }

    if (!REQUEST_ID_RE.test(requestId)) {
      return NextResponse.json(
        { error: 'Invalid requestId format' },
        { status: 400 }
      );
    }

    const response = await getRelayResponse(requestId);
    if (!response) {
      return NextResponse.json(
        { error: 'Response not found or expired in Redis.' },
        { status: 404 }
      );
    }

    await deleteRelayResponse(requestId);
    await deleteRelayRequestBinding(requestId).catch(() => undefined);

    if (response.error) {
      return NextResponse.json(
        { error: response.error },
        { status: 502 }
      );
    }

    return NextResponse.json({
      error: null,
      data: response.data,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to retrieve relay response' }, { status: 500 });
  }
}

export const GET = withRateLimit({ endpoint: 'relay:response' })(handler);
