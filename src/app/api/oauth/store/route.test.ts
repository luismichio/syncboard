import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock lib/relayRedis functions
vi.mock('@/lib/relayRedis', () => ({
  storeOauthToken: vi.fn(),
  getOauthToken: vi.fn(),
}));

import { GET, POST } from './route';
import { storeOauthToken, getOauthToken } from '@/lib/relayRedis';

const mockStoreOauthToken = vi.mocked(storeOauthToken);
const mockGetOauthToken = vi.mocked(getOauthToken);

describe('OAuth Store Route Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/oauth/store', () => {
    it('returns 400 for invalid or missing state parameter', async () => {
      const request = new Request('http://localhost:3000/api/oauth/store?state=short');
      const response = await GET(request);
      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json.error).toContain('Invalid or missing state');
    });

    it('returns status pending when token is not yet stored', async () => {
      mockGetOauthToken.mockResolvedValueOnce(null);

      const validState = 'a'.repeat(32);
      const request = new Request(`http://localhost:3000/api/oauth/store?state=${validState}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe('pending');
    });

    it('returns status success with token payload when token exists', async () => {
      const samplePayload = {
        accessToken: 'figma_access_token_123',
        refreshToken: 'figma_refresh_token_456',
        expiresAt: Date.now() + 3600000,
        teamId: 'team_789',
      };
      mockGetOauthToken.mockResolvedValueOnce(samplePayload);

      const validState = 'b'.repeat(32);
      const request = new Request(`http://localhost:3000/api/oauth/store?state=${validState}`);
      const response = await GET(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe('success');
      expect(json.tokens.accessToken).toBe('figma_access_token_123');
    });
  });

  describe('POST /api/oauth/store', () => {
    it('returns 400 for invalid JSON body', async () => {
      const request = new Request('http://localhost:3000/api/oauth/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json',
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('returns 400 when state is missing or invalid', async () => {
      const request = new Request('http://localhost:3000/api/oauth/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: 'too-short',
          tokens: { accessToken: 'token', expiresAt: Date.now() },
        }),
      });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('returns 200 on successful token storage', async () => {
      mockStoreOauthToken.mockResolvedValueOnce(true);

      const validState = 'c'.repeat(32);
      const request = new Request('http://localhost:3000/api/oauth/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: validState,
          tokens: {
            accessToken: 'valid_access_token',
            refreshToken: 'valid_refresh_token',
            expiresAt: Date.now() + 3600000,
          },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
    });
  });
});
