import { describe, expect, it } from 'vitest';
import { GET, POST } from './route';

/**
 * Route-level coverage for the Ably token boundary. The 409/429 capacity
 * decisions live behind hasRedis (Upstash env) and are covered by the
 * relayRedis planner unit tests — here we exercise the pre-external-call
 * validation and the graceful configuration-error path, which are exactly
 * the surfaces an HTTP client actually touches first.
 *
 * Note: when ABLY_API_KEY is present these tests would hit Ably REST, so the
 * issuance-path assertion only ever asserts "not 400" in that case.
 */

const ABLY_KEY_PRESENT = !!process.env.ABLY_API_KEY;
const VALID_PAIRING = 'sb_abcdefghijklmnop';

function postJson(body: unknown): Request {
  return new Request('http://localhost/api/ably/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('ably token route — input validation (pre-external-call)', () => {
  it('POST rejects an invalid pairingId with 400', async () => {
    const res = await POST(postJson({ pairingId: 'bad id!', platform: 'penpot', client: 'companion' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain('Invalid pairingId');
  });

  it('POST rejects a miro client without a valid sessionId with 400', async () => {
    const res = await POST(
      postJson({ pairingId: VALID_PAIRING, platform: 'penpot', client: 'miro', sessionId: 'not-a-uuid' })
    );
    expect(res.status).toBe(400);
  });

  it('POST rejects a malformed userIdHash with 400', async () => {
    const res = await POST(
      postJson({ pairingId: VALID_PAIRING, platform: 'penpot', client: 'companion', userIdHash: 'not-64-hex' })
    );
    expect(res.status).toBe(400);
  });

  it('GET rejects an invalid pairingId with 400', async () => {
    const res = await GET(new Request('http://localhost/api/ably/token?pairingId=x'));
    expect(res.status).toBe(400);
  });

  it('valid companion request passes validation (issuance requires ABLY_API_KEY)', async () => {
    const res = await GET(
      new Request(`http://localhost/api/ably/token?pairingId=${VALID_PAIRING}&platform=penpot&client=companion`)
    );
    if (ABLY_KEY_PRESENT) {
      // Can't promise an external Ably call in CI — assert only that the
      // request survived validation.
      expect(res.status).not.toBe(400);
    } else {
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain('Ably API key not configured');
    }
  });

  it('valid miro request passes validation (issuance requires ABLY_API_KEY)', async () => {
    const sessionId = 'a3f8e1c2-9d4b-4f0e-8a6c-1b2d3e4f5a6b';
    const res = await GET(
      new Request(
        `http://localhost/api/ably/token?pairingId=${VALID_PAIRING}&platform=penpot&client=miro&sessionId=${sessionId}`
      )
    );
    if (ABLY_KEY_PRESENT) {
      expect(res.status).not.toBe(400);
    } else {
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain('Ably API key not configured');
    }
  });
});
