import { describe, expect, it, beforeEach } from 'vitest';
import {
  ablyTokenCacheKey,
  getCachedAblyToken,
  setCachedAblyToken,
  invalidateAblyToken,
  invalidateAllAblyTokens,
} from '@/lib/ablyTokenCache';

describe('ablyTokenCache', () => {
  beforeEach(() => {
    invalidateAllAblyTokens();
  });

  it('stores and retrieves unexpired tokens', () => {
    const key = ablyTokenCacheKey('sb_pair1', 'figma', 's-123');
    const details = { token: 'sample-token', expires: Date.now() + 600_000 };
    setCachedAblyToken(key, details);
    expect(getCachedAblyToken(key)).toEqual(details);
  });

  it('returns null and invalidates tokens near expiry', () => {
    const key = ablyTokenCacheKey('sb_pair1', 'figma', 's-123');
    // Set expiry to 2 minutes from now (within the 5-minute reuse margin)
    const details = { token: 'sample-token', expires: Date.now() + 2 * 60_000 };
    setCachedAblyToken(key, details);
    expect(getCachedAblyToken(key)).toBeNull();
  });

  it('invalidates specific token keys', () => {
    const key = ablyTokenCacheKey('sb_pair1', 'figma', 's-123');
    const details = { token: 'sample-token', expires: Date.now() + 600_000 };
    setCachedAblyToken(key, details);
    invalidateAblyToken(key);
    expect(getCachedAblyToken(key)).toBeNull();
  });
});
