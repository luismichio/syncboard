import { useCallback, useEffect, useRef, useState } from 'react';

export type RelayStatusLevel = 'available' | 'high_load' | 'full';

export interface RelayStatus {
  activeSessions: number;
  maxSessions: number;
  globalSyncsToday: number | null;
  maxGlobalSyncs: number;
  status: RelayStatusLevel;
  userConflict?: boolean;
  activeBoardId?: string;
}

const RELAY_STATUS_POLL_MS = 30_000;

/**
 * Polls /api/relay/status so the Miro sidebar can surface live community
 * relay capacity (slots used, demand level, full/queued state) and — when a
 * userIdHash/boardId pair is provided — the per-user 1-board conflict state
 * (v0.15.1 transfer banner).
 */
export function useRelayStatus(
  userIdHash?: string | null,
  boardId?: string | null
): {
  status: RelayStatus | null;
  lastCheckedAt: number | null;
  refetch: () => void;
} {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const refetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const query =
        userIdHash && boardId
          ? '?userIdHash=' + encodeURIComponent(userIdHash) + '&boardId=' + encodeURIComponent(boardId)
          : '';
      const response = await fetch('/api/relay/status' + query, { cache: 'no-store' });
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (isRelayStatus(payload)) {
        setStatus(payload);
        setLastCheckedAt(Date.now());
      }
    } catch {
      // Keep the last known status; the banner stays on its current state.
    } finally {
      inFlight.current = false;
    }
  }, [userIdHash, boardId]);

  useEffect(() => {
    // Defer the first poll by one tick so the fetch + setState run in an async
    // callback context (react-hooks/set-state-in-effect).
    const initial = setTimeout(() => void refetch(), 0);
    const interval = setInterval(() => void refetch(), RELAY_STATUS_POLL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [refetch]);

  return { status, lastCheckedAt, refetch };
}

function isRelayStatus(value: unknown): value is RelayStatus {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.activeSessions === 'number' &&
    typeof record.maxSessions === 'number' &&
    (record.status === 'available' ||
      record.status === 'high_load' ||
      record.status === 'full') &&
    (record.userConflict === undefined || typeof record.userConflict === 'boolean') &&
    (record.activeBoardId === undefined || typeof record.activeBoardId === 'string')
  );
}