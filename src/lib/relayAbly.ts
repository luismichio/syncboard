import { Rest } from 'ably';
import type { TokenParams } from 'ably';
import type { RelayCommand } from './relayRedis';

const CHANNEL_PREFIX = 'penpot';

function getAblyRest(): Rest {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Ably API key not configured. Set ABLY_API_KEY environment variable.'
    );
  }
  return new Rest({ key: apiKey });
}

function channelName(pairingId: string): string {
  return `${CHANNEL_PREFIX}:${pairingId}`;
}

/**
 * Publish a Penpot command to the Ably channel for the given pairingId.
 * The companion subscribes to this channel to receive commands in real-time.
 */
export async function publishPenpotCommand(
  pairingId: string,
  command: RelayCommand
): Promise<void> {
  const ably = getAblyRest();
  const channel = ably.channels.get(channelName(pairingId));
  await channel.publish('command', command);
}

/**
 * Check if a companion is currently connected (present) on the Ably channel.
 * Uses Ably's presence REST API instead of a Redis heartbeat.
 */
export async function isPenpotOnlineAbly(
  pairingId: string
): Promise<boolean> {
  const ably = getAblyRest();
  try {
    const channel = ably.channels.get(channelName(pairingId));
    const presenceMessages = await channel.presence.get();
    return Array.isArray(presenceMessages) && presenceMessages.length > 0;
  } catch {
    return false;
  }
}

/**
 * Generate an Ably token for the companion to authenticate via WebSocket.
 * The token is restricted to subscribe+presence on the specific pairing channel.
 * Returns an actual TokenDetails object (not a TokenRequest) for compatibility
 * with the Ably browser SDK loaded from CDN.
 */
export async function generateAblyToken(
  pairingId: string
): Promise<Record<string, unknown>> {
  const ably = getAblyRest();
  const tokenParams: TokenParams = {
    capability: JSON.stringify({
      [`${CHANNEL_PREFIX}:${pairingId}`]: ['subscribe', 'presence'],
    }),
    ttl: 2 * 60 * 60 * 1000, // 2 hours
    clientId: `companion:${pairingId}`,
  };
  const tokenDetails = await ably.auth.requestToken(tokenParams, undefined);
  return tokenDetails as unknown as Record<string, unknown>;
}
