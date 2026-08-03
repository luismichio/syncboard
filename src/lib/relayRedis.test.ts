import { describe, expect, it } from 'vitest';
import { deriveRelayStatusLevel, planAcquire, planTransfer, type UserBoardBinding } from '@/lib/relayRedis';

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