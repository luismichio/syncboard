import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTokenExpiring, TokenData } from './tokens';

describe('tokens helper tests', () => {
  beforeEach(() => {
    // Lock date to a fixed timestamp: 1000000000000 (roughly Sep 2001)
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000000000000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isTokenExpiring', () => {
    it('should return true if token is null', () => {
      expect(isTokenExpiring(null)).toBe(true);
    });

    it('should return true if token is already expired', () => {
      const expiredToken: TokenData = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 1000000000000 - 1000, // 1s ago
      };
      expect(isTokenExpiring(expiredToken)).toBe(true);
    });

    it('should return true if token is expiring within the 5-minute buffer', () => {
      const buffer = 5 * 60 * 1000;
      const expiringToken: TokenData = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 1000000000000 + buffer - 1000, // expiring in 4m 59s
      };
      expect(isTokenExpiring(expiringToken)).toBe(true);
    });

    it('should return false if token is expiring after the 5-minute buffer', () => {
      const buffer = 5 * 60 * 1000;
      const freshToken: TokenData = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 1000000000000 + buffer + 1000, // expiring in 5m 1s
      };
      expect(isTokenExpiring(freshToken)).toBe(false);
    });
  });
});
