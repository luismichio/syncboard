import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import {
  getRelayRequestBinding,
  RelayJson,
  storeRelayResponse,
} from '@/lib/relayRedis';

const REQUEST_ID_RE = /^req_[a-f0-9]{32}$/;
const PAIRING_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

interface ResultBody {
  requestId?: string;
  pairingId?: string;
  data?: RelayJson;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBody(value: unknown): ResultBody | null {
  if (!isRecord(value)) return null;
  const requestId = typeof value.requestId === 'string' ? value.requestId.trim() : '';
  const pairingId = typeof value.pairingId === 'string' ? value.pairingId.trim() : '';
  const error = typeof value.error === 'string' ? value.error : undefined;

  if (!REQUEST_ID_RE.test(requestId) || !PAIRING_ID_RE.test(pairingId)) {
    return null;
  }

  return {
    requestId,
    pairingId,
    data: (value.data as RelayJson | undefined) ?? null,
    error,
  };
}

async function handler(request: Request) {
  try {
    const body = parseBody(await request.json().catch(() => null));
    if (!body?.requestId || !body.pairingId) {
      return NextResponse.json({ error: 'Invalid requestId or pairingId.' }, { status: 400 });
    }

    const binding = await getRelayRequestBinding(body.requestId);
    if (!binding) {
      return NextResponse.json({ error: 'Relay request not found or expired.' }, { status: 404 });
    }
    if (binding.pairingId !== body.pairingId || binding.platform !== 'penpot') {
      return NextResponse.json({ error: 'Relay result does not match the request pairing.' }, { status: 403 });
    }

    await storeRelayResponse(body.requestId, {
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

export const POST = withRateLimit({ endpoint: 'relay:result' })(handler);
