import { describe, expect, it } from 'vitest';
import {
  deriveRelayStatusLevel,
  planAcquire,
  planTransfer,
  selectEvictionCandidate,
  planCompanionTokenAcquisition,
  planCompanionBinding,
  type UserBoardBinding,
} from '@/lib/relayRedis';

describe('deriveRelayStatusLevel', () => {
  it('reports available below 75% of the ceiling', () => {
    expect(deriveRelayStatusLevel(0, 40)).toBe('available');
    expect(deriveRelayStatusLevel(29, 40)).toBe('available');
  });

  it('reports high_load from 75% of the ceiling', () => {
    expect(deriveRelayStatusLevel(30, 40)).toBe('high_load');
    expect(deriveRelayStatusLevel(39, 40)).toBe('high_load');
  });

  it('reports full at the ceiling and beyond', () => {
    expect(deriveRelayStatusLevel(40, 40)).toBe('full');
    expect(deriveRelayStatusLevel(41, 40)).toBe('full');
  });

  it('scales the high-load threshold with the ceiling', () => {
    expect(deriveRelayStatusLevel(44, 60)).toBe('available');
    expect(deriveRelayStatusLevel(45, 60)).toBe('high_load');
    expect(deriveRelayStatusLevel(60, 60)).toBe('full');
  });
});


function makeBinding(boardId: string, sessionId: string): UserBoardBinding {
  return { boardId, sessionId, updatedAt: 1_752_000_000_000 };
}

describe('planAcquire', () => {
  it('grants when no binding exists and capacity is available', () => {
    expect(planAcquire(null, 'board-b', 10, 40)).toBe('grant');
  });

  it('reports full when no binding and the pool is at capacity', () => {
    expect(planAcquire(null, 'board-b', 40, 40)).toBe('full');
  });

  it('renews when the binding points at the same board', () => {
    expect(planAcquire(makeBinding('board-a', 's-1'), 'board-a', 10, 40)).toBe('renew');
  });

  it('conflicts when the binding points at a different board', () => {
    expect(planAcquire(makeBinding('board-a', 's-1'), 'board-b', 10, 40)).toBe('conflict');
  });
});

describe('planTransfer', () => {
  it('grants a transfer when a binding exists (previous holder freed first)', () => {
    expect(planTransfer(makeBinding('board-a', 's-1'), 38, 40)).toBe('grant');
  });

  it('grants when no binding and capacity is available', () => {
    expect(planTransfer(null, 10, 40)).toBe('grant');
  });

  it('reports full when no binding and the pool is at capacity', () => {
    expect(planTransfer(null, 40, 40)).toBe('full');
  });
});

describe('selectEvictionCandidate', () => {
  it('chooses the oldest orphan candidate when multiple orphans exist', () => {
    const candidates = [
      { pairingId: 'p-new-orphan', connectedAt: 200, hasActiveMiroPairing: false },
      { pairingId: 'p-old-orphan', connectedAt: 100, hasActiveMiroPairing: false },
      { pairingId: 'p-active-miro', connectedAt: 50, hasActiveMiroPairing: true },
    ];
    expect(selectEvictionCandidate(candidates)).toBe('p-old-orphan');
  });

  it('never evicts an active Miro pairing (returns null when all have active Miro bindings)', () => {
    const candidates = [
      { pairingId: 'p-active-1', connectedAt: 100, hasActiveMiroPairing: true },
      { pairingId: 'p-active-2', connectedAt: 200, hasActiveMiroPairing: true },
    ];
    expect(selectEvictionCandidate(candidates)).toBeNull();
  });
});

describe('planCompanionTokenAcquisition', () => {
  it('grants without eviction if already present or below cap', () => {
    const candidates = [
      { pairingId: 'p-1', connectedAt: 100, hasActiveMiroPairing: false },
    ];
    expect(planCompanionTokenAcquisition(1000, candidates, 180, 'p-2')).toEqual({
      decision: 'grant',
      evictedPairingId: null,
    });
  });

  it('evicts oldest orphan when at cap and new pairing requests token', () => {
    const candidates = [
      { pairingId: 'p-1', connectedAt: 100, hasActiveMiroPairing: false },
      { pairingId: 'p-2', connectedAt: 200, hasActiveMiroPairing: true },
    ];
    expect(planCompanionTokenAcquisition(1000, candidates, 2, 'p-3')).toEqual({
      decision: 'grant',
      evictedPairingId: 'p-1',
    });
  });

  it('reports full when at cap and all existing tokens belong to active Miro pairings', () => {
    const candidates = [
      { pairingId: 'p-1', connectedAt: 100, hasActiveMiroPairing: true },
      { pairingId: 'p-2', connectedAt: 200, hasActiveMiroPairing: true },
    ];
    expect(planCompanionTokenAcquisition(1000, candidates, 2, 'p-3')).toEqual({
      decision: 'full',
      evictedPairingId: null,
    });
  });
});

describe('planCompanionBinding', () => {
  it('grants when no binding exists or matching tabId', () => {
    expect(planCompanionBinding(null, 'tab-1')).toBe('grant');
    expect(
      planCompanionBinding(
        { tabId: 'tab-1', platform: 'figma', connectedAt: 100 },
        'tab-1'
      )
    ).toBe('grant');
  });

  it('conflicts when a binding belongs to a different tabId', () => {
    expect(
      planCompanionBinding(
        { tabId: 'tab-1', platform: 'figma', connectedAt: 100 },
        'tab-2'
      )
    ).toBe('conflict');
  });
});