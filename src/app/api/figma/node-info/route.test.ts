import { describe, it, expect, vi, beforeEach } from 'vitest';

function createGetRequest(params: Record<string, string>, headers: Record<string, string> = {}): Request {
  const url = new URL('http://localhost:3000/api/figma/node-info');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { headers });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/figma/node-info', () => {
  it('returns 400 when params are missing', async () => {
    const { GET } = await import('./route');
    const res = await GET(createGetRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 400 when token header is missing', async () => {
    const { GET } = await import('./route');
    const res = await GET(createGetRequest({ fileKey: 'abc', nodeId: '1:2' }));
    expect(res.status).toBe(400);
  });

  it('returns node name on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ nodes: { '1:2': { document: { name: 'My Frame' } } } }),
        { status: 200 }
      )
    );

    const { GET } = await import('./route');
    const res = await GET(
      createGetRequest({ fileKey: 'abc', nodeId: '1:2' }, { Authorization: 'Bearer tok' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('My Frame');
  });

  it('returns "Pasted Screen" fallback on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 404 })
    );

    const { GET } = await import('./route');
    const res = await GET(
      createGetRequest({ fileKey: 'abc', nodeId: '1:2' }, { Authorization: 'Bearer tok' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Pasted Screen');
  });

  it('returns "Pasted Screen" fallback on network exception', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const { GET } = await import('./route');
    const res = await GET(
      createGetRequest({ fileKey: 'abc', nodeId: '1:2' }, { Authorization: 'Bearer tok' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Pasted Screen');
  });
});
