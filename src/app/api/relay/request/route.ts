import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import {
  deleteRelayRequestBinding,
  RelayCommand,
  storeRelayRequestBinding,
} from '@/lib/relayRedis';
import {
  publishPenpotCommand,
  isPenpotOnlineAbly,
} from '@/lib/relayAbly';

interface RelayRequestBody {
  pairingId?: string;
  platform?: 'figma' | 'penpot';
  action?: 'select' | 'export';
  shapeId?: string;
  format?: 'svg' | 'png';
  scale?: number;
  timeoutMs?: number;
  async?: boolean;
}


function buildCommand(body: RelayRequestBody, requestId: string): RelayCommand {
  const action = body.action;
  if (action !== 'select' && action !== 'export') {
    throw new Error('Invalid action. Supported actions: select, export.');
  }

  const command: RelayCommand = {
    id: requestId,
    action,
    createdAt: Date.now(),
  };

  if (action === 'export') {
    if (!body.shapeId || body.shapeId.trim().length === 0) {
      throw new Error('shapeId is required for export action.');
    }
    command.shapeId = body.shapeId;
    command.format = body.format === 'png' ? 'png' : 'svg';
    if (typeof body.scale === 'number' && Number.isFinite(body.scale)) {
      command.scale = body.scale;
    }
  }

  return command;
}

async function handler(request: Request) {
  try {
    const rawBody: unknown = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const body = rawBody as RelayRequestBody;
    const pairingId = body.pairingId?.trim();

    if (!pairingId) {
      return NextResponse.json({ error: 'pairingId is required.' }, { status: 400 });
    }

    const commandAction = body.action;
    if (commandAction !== 'select' && commandAction !== 'export') {
      return NextResponse.json({ error: 'action is required and must be select or export.' }, { status: 400 });
    }
    // R4: async pub/sub is the only mode — the old 350ms Upstash long-poll
    // (23-46 GETs per op) is gone. Reject sync callers up front so no future
    // platform can silently reintroduce the poll.
    // (R1 lease-SET-EX TTL, R3 Lua math, and R2 inline-vs-Redis routing are
    // integration-gated: they only run against live Redis / the companion UI,
    // covered by their JS logic mirrors in relayRedis.ts + manual QA.)
    if (body.async !== true) {
      return NextResponse.json(
        { error: 'Synchronous relay polling is not supported. Use async relay mode (async: true).' },
        { status: 400 }
      );
    }

    const platform = body.platform || 'penpot';
    const online = await isPenpotOnlineAbly(pairingId, platform);
    if (!online) {
      const platformName = platform === 'figma' ? 'Figma' : 'Penpot';
      return NextResponse.json(
        { error: `SyncingBoard companion is offline. Open your ${platformName} companion plugin and connect using this pairing ID.` },
        { status: 404 }
      );
    }

    const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    if (commandAction === 'export' && !hasRedis) {
      return NextResponse.json(
        { error: 'Relay export requires Redis result storage. Configure Upstash Redis or use Figma URL sync.' },
        { status: 503 }
      );
    }

    const requestId = `req_${crypto.randomUUID().replace(/-/g, '')}`;
    const command = buildCommand(body, requestId);
    if (commandAction === 'export') {
      await storeRelayRequestBinding(requestId, { pairingId, platform });
    }

    try {
      await publishPenpotCommand(pairingId, command, platform);
    } catch (error) {
      if (commandAction === 'export') {
        await deleteRelayRequestBinding(requestId).catch(() => undefined);
      }
      throw error;
    }

    return NextResponse.json({
      error: null,
      data: { requestId, async: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Relay request failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withRateLimit({ endpoint: "relay:request" })(
  withRateLimit({
    endpoint: "relay:export",
    // Strict export sub-budget applies only to heavy export commands;
    // lightweight selections keep the base relay:request budget.
    skipWhen: async (req) => {
      try {
        const body: unknown = await req.clone().json();
        return (body as Record<string, unknown>)?.action !== "export";
      } catch {
        return true;
      }
    },
  })(handler)
);
