import { describe, expect, it } from 'vitest';
import { POST } from './route';

/**
 * R4 — async pub/sub is the only relay mode. The old 350ms Upstash long-poll
 * was removed; any non-async caller must be rejected with a 400 BEFORE any
 * Ably/Redis work happens (so this test needs no external env).
 */
describe('relay request — async-only (R4)', () => {
  it('rejects synchronous (non-async) requests with 400', async () => {
    const res = await POST(
      new Request('http://localhost/api/relay/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairingId: 'sb_testpairing123',
          action: 'select',
          async: false,
        }),
      })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain('Synchronous relay polling is not supported');
  });

  it('accepts async requests (happy path reaches the request path)', async () => {
    // Without Ably/Redis env the online check returns "offline", which yields
    // a 404 — but it proves the async:true request is NOT rejected with the
    // sync-mode 400.
    const res = await POST(
      new Request('http://localhost/api/relay/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairingId: 'sb_testpairing123',
          action: 'select',
          async: true,
        }),
      })
    );
    expect(res.status).not.toBe(400);
  });
});
