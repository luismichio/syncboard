import { useEffect, useState } from 'react';
import { onRelayActivity, onRelayConflict, onRelayConnectionState, transferRelaySession } from '../companionRelayClient';
import type { RelayConnectionState } from '../companionRelayClient';
import { useRelayStatus } from '../useRelayStatus';

// Manual retry cooldown: prevents hammering /api/relay/status when full
// (user asked for a 5–10s delay between retry clicks).
const RELAY_RETRY_COOLDOWN_MS = 7_000;

interface RelayStatusBannerProps {
  userIdHash?: string | null;
  boardId?: string | null;
  useTauri?: boolean;
  figmaConnected?: boolean;
}

/**
 * Live community relay status for the Sync tab (v0.15.1).
 *  - Local transport (Tauri, both connections live): cyan — 0 cloud slots.
 *  - userConflict: amber transfer card — 1 active board per Miro user,
 *    move the session to this board with one click (7s cooldown).
 *  - not connected (idle/connecting): neutral gray card — the pool is
 *    reachable but this tab holds no session (connections are lazy).
 *  - connected: green dot, slot count · high_load: amber · full: red,
 *    manual "Check again" retry + queue hint.
 * No paid upsell — the desktop (Tauri) tier is the queue-escape hatch,
 * hinted at, unpaid.
 */
export function RelayStatusBanner({
  userIdHash,
  boardId,
  useTauri = false,
  figmaConnected = false,
}: RelayStatusBannerProps) {
  const { status, refetch } = useRelayStatus(userIdHash, boardId);
  const [connectionState, setConnectionState] = useState<RelayConnectionState>('idle');
  const [retryReadyAt, setRetryReadyAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [transferring, setTransferring] = useState<boolean>(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  useEffect(() => {
    if (retryReadyAt === null) return;
    const interval = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (tick >= retryReadyAt) setRetryReadyAt(null);
    }, 250);
    return () => clearInterval(interval);
  }, [retryReadyAt]);

  // Heartbeat-level conflicts (200-conflict on the session route) force an
  // immediate status refetch so the banner flips without waiting for the poll.
  useEffect(() => {
    onRelayConflict(() => {
      void refetch();
    });
    // R1: relay ops (detect/import/sync) refresh the capacity readout on
    // demand — the blind 30s poll is gone.
    const offActivity = onRelayActivity(() => {
      void refetch();
    });
    return () => {
      onRelayConflict(null);
      offActivity();
    };
  }, [refetch]);

  // Relay connection state (idle | connecting | connected) so the banner can
  // distinguish "pool is available but this tab holds no session" from a live
  // connection (v0.15.1: connections are lazy — opening the plugin takes no slot).
  // Refetch on every transition: the lease is acquired/released exactly at these
  // edges, so the slot count converges immediately instead of waiting for the
  // 30s poll (otherwise the card reads "Connected — 0/40" right after detecting).
  useEffect(
    () =>
      onRelayConnectionState((state) => {
        setConnectionState(state);
        void refetch();
      }),
    [refetch]
  );

  const remainingSeconds =
    retryReadyAt === null ? 0 : Math.max(0, Math.ceil((retryReadyAt - now) / 1000));
  const isCoolingDown = remainingSeconds > 0;

  // Desktop tier active: local transport is unmetered and the cloud slot
  // was released back to the pool.
  if (useTauri && figmaConnected) {
    return (
      <div className="rounded-md border border-cyan-500/40 px-2.5 py-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-cyan-400" />
          <span className="text-[9px] font-mono text-text-muted flex-1 leading-tight">
            Local Transport — 0/{status?.maxSessions ?? 40} slots used
          </span>
        </div>
        <p className="text-[8px] font-mono text-text-muted/60 leading-tight">
          Direct localhost stream — 0 cloud slots consumed.
        </p>
      </div>
    );
  }

  // 1-board-per-user conflict: this board is not the active session.
  if (status?.userConflict) {
    const handleTransfer = async () => {
      if (transferring) return;
      setTransferring(true);
      setTransferError(null);
      try {
        await transferRelaySession();
        setRetryReadyAt(Date.now() + RELAY_RETRY_COOLDOWN_MS);
        void refetch();
      } catch (err) {
        setTransferError(err instanceof Error ? err.message : 'Transfer failed.');
      } finally {
        setTransferring(false);
      }
    };

    return (
      <div className="rounded-md border border-amber-500/40 px-2.5 py-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-500" />
          <span className="text-[9px] font-mono text-text-muted flex-1 leading-tight">
            Active session on another board
          </span>
          <button
            onClick={handleTransfer}
            disabled={transferring || isCoolingDown}
            className="shrink-0 text-[8px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-accent/40 text-accent hover:bg-accent/10 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {transferring
              ? 'Transferring…'
              : isCoolingDown
                ? `Transfer · ${remainingSeconds}s`
                : 'Transfer Session'}
          </button>
        </div>
        {status.activeBoardId && (
          <p className="text-[8px] font-mono text-text-muted/60 leading-tight">
            Board {status.activeBoardId} holds your active session.
          </p>
        )}
        {transferError && (
          <p className="text-[8px] font-mono text-red-400 leading-tight">{transferError}</p>
        )}
      </div>
    );
  }

  // No live relay connection: the pool is reachable but this tab holds no
  // session. "Not connected" is a first-class state, not a 0/40 slot count.
  if (connectionState !== 'connected') {
    const connecting = connectionState === 'connecting';
    return (
      <div className="rounded-md border border-border-card px-2.5 py-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${connecting ? 'bg-amber-400 animate-pulse' : 'bg-text-muted/40'}`}
          />
          <span className="text-[9px] font-mono text-text-muted flex-1 leading-tight">
            {connecting
              ? 'Connecting to Community relay…'
              : `Community relay available — 0/${status?.maxSessions ?? 40} in use · Not connected`}
          </span>
        </div>
        <p className="text-[8px] font-mono text-text-muted/60 leading-tight">
          {connecting
            ? 'A slot is taken only while a selection request is in flight.'
            : 'Connect by detecting a selection in Figma or Penpot — a slot is held only while the connection is live.'}
        </p>
      </div>
    );
  }

  if (!status) return null;

  const { activeSessions, maxSessions, status: level } = status;
  const dotClass =
    level === 'full' ? 'bg-red-500' : level === 'high_load' ? 'bg-amber-500' : 'bg-emerald-500';
  const borderClass =
    level === 'full'
      ? 'border-red-500/50'
      : level === 'high_load'
        ? 'border-amber-500/40'
        : 'border-border-card';
  const label =
    level === 'full'
      ? `Connected — Capacity Full (${activeSessions}/${maxSessions})`
      : level === 'high_load'
        ? `Connected — High Demand: ${activeSessions}/${maxSessions} slots`
        : `Connected — ${activeSessions}/${maxSessions} slots`;

  const handleRetry = () => {
    if (isCoolingDown) return;
    setRetryReadyAt(Date.now() + RELAY_RETRY_COOLDOWN_MS);
    void refetch();
  };

  return (
    <div className={`rounded-md border px-2.5 py-2 flex flex-col gap-1.5 ${borderClass}`}>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-[9px] font-mono text-text-muted flex-1 leading-tight">{label}</span>
        {level === 'full' && (
          <button
            onClick={handleRetry}
            disabled={isCoolingDown}
            className="shrink-0 text-[8px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-accent/40 text-accent hover:bg-accent/10 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isCoolingDown ? `Check again · ${remainingSeconds}s` : 'Check again'}
          </button>
        )}
      </div>
      {level === 'full' && (
        <p className="text-[8px] font-mono text-text-muted/60 leading-tight">
          Desktop app (free) coming soon — sync without queues.
        </p>
      )}
    </div>
  );
}