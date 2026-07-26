import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import {
  deleteRelayResponse,
  getRelayResponse,
  RelayCommand,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampTimeout(timeoutMs: number | undefined, action: 'select' | 'export'): number {
  const fallback = action === 'select' ? 7000 : 16000;
  if (typeof timeoutMs !== 'number' || Number.isNaN(timeoutMs)) {
    return fallback;
  }
  return Math.min(25_000, Math.max(1_000, Math.round(timeoutMs)));
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
    const body = (await request.json()) as RelayRequestBody;
    const pairingId = body.pairingId?.trim();

    if (!pairingId) {
      return NextResponse.json({ error: 'pairingId is required.' }, { status: 400 });
    }

    const commandAction = body.action;
    if (commandAction !== 'select' && commandAction !== 'export') {
      return NextResponse.json({ error: 'action is required and must be select or export.' }, { status: 400 });
    }

    const platform = body.platform || 'penpot';
    const online = await isPenpotOnlineAbly(pairingId, platform);
    if (!online) {
      const platformName = platform === 'figma' ? 'Figma' : 'Penpot';
      return NextResponse.json(
        { error: `SyncBoard companion is offline. Open your ${platformName} companion plugin and connect using this pairing ID.` },
        { status: 404 }
      );
    }

    const requestId = `req_${crypto.randomUUID().replace(/-/g, '')}`;
    const command = buildCommand(body, requestId);
    await publishPenpotCommand(pairingId, command, platform);

    if (body.async) {
      return NextResponse.json({
        error: null,
        data: { requestId, async: true },
      });
    }

    const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    if (!hasRedis) {
      return NextResponse.json(
        { error: 'Synchronous relay polling requires Redis. Use async relay mode or configure Upstash Redis.' },
        { status: 503 }
      );
    }

    const timeoutMs = clampTimeout(body.timeoutMs, commandAction);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const response = await getRelayResponse(requestId);

      if (response) {
        await deleteRelayResponse(requestId);

        if (response.error) {
          return NextResponse.json({ error: response.error }, { status: 502 });
        }

        return NextResponse.json({
          error: null,
          data: response.data,
        });
      }

      await sleep(350);
    }

    return NextResponse.json({ error: 'Relay request timed out waiting for companion response.' }, { status: 504 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Relay request failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withRateLimit({ endpoint: "relay:request" })(handler);
