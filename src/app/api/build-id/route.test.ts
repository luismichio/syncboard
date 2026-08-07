import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/build-id', () => {
  it('returns ok + a build string (empty on production builds)', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; build: string };
    expect(body.ok).toBe(true);
    expect(typeof body.build).toBe('string');
    // In dev (version.generated.ts present with a BUILD) it is a local-<sha> id.
    if (body.build) expect(body.build).toMatch(/^local-/);
  });
});
