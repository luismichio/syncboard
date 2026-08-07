import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import {
  getCompanionSession,
  releaseCompanionSession,
  transferCompanionSession,
} from '@/lib/relayRedis';
import { publishCompanionEvent } from '@/lib/sync/relayAbly';

const PAIRING_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const TAB_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
type CompanionSessionAction = 'release' | 'transfer';

interface CompanionSessionBody {
  pairingId: string;
  tabId: string;
  action: CompanionSessionAction;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBody(value: unknown): CompanionSessionBody | null {
  if (!isRecord(value)) return null;
  const pairingId = typeof value.pairingId === 'string' ? value.pairingId.trim() : '';
  const tabId = typeof value.tabId === 'string' ? value.tabId.trim() : '';
  const action =
    value.action === 'release' || value.action === 'transfer' ? value.action : null;
  if (!PAIRING_ID_RE.test(pairingId) || !TAB_ID_RE.test(tabId) || !action) return null;
  return { pairingId, tabId, action };
}

/**
 * Companion session lifecycle (Design B — 1 tab per pairing):
 * - release:  the holder tab frees the binding + token slot (pagehide / re-pair).
 * - transfer: a new tab claims the pairing; the previous holder is retired via
 *   a 'companion_transferred' broadcast so it disconnects instead of fighting.
 */
async function postHandler(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: 'Invalid companion session request.' }, { status: 400 });
  }
  try {
    if (body.action === 'release') {
      const released = await releaseCompanionSession(body.pairingId, body.tabId);
      return NextResponse.json({ released });
    }
    const current = await getCompanionSession(body.pairingId);
    const previous = await transferCompanionSession(
      body.pairingId,
      body.tabId,
      current?.platform ?? 'penpot'
    );
    if (previous) {
      await publishCompanionEvent(
        body.pairingId,
        previous.platform,
        'companion_transferred',
        previous.tabId
      ).catch(() => undefined);
    }
    return NextResponse.json({
      transferred: true,
      activeTabId: previous?.tabId ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Companion session operation failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withRateLimit({ endpoint: 'relay:companion:session' })(postHandler);
