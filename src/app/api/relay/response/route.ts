import { NextResponse } from 'next/server';
import { getRelayResponse, deleteRelayResponse } from '@/lib/relayRedis';

/**
 * GET /api/relay/response
 *
 * Single-read retrieval endpoint for event-driven relay architecture.
 * Miro calls this once notified via Ably WebSocket that the result is ready.
 * Fetches the result from Redis and immediately deletes it to clean up.
 *
 * Query Params: ?requestId=req_xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId')?.trim();

    if (!requestId) {
      return NextResponse.json(
        { error: 'Missing required query parameter: requestId' },
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

    // Clean up key immediately after read
    await deleteRelayResponse(requestId);

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
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
