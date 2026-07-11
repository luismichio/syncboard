import { describe, it, expect, vi, beforeEach } from 'vitest';

function createRequest(params: Record<string, string>, headers: Record<string, string> = {}): Request {
  const url = new URL('http://localhost:3000/api/figma/render');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { headers });
}

const mockImageUrl = 'https://figma-s3.example.com/render.png';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/figma/render', () => {
  it('returns 400 when fileKey or nodeId is missing', async () => {
    const { GET } = await import('./route');
    const res = await GET(createRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 401 when no token is provided', async () => {
    const { GET } = await import('./route');
    const res = await GET(createRequest({ fileKey: 'abc', nodeId: '1:2' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Missing Figma Authorization');
  });

  it('returns 502 when S3 download fails', async () => {
    // Mock Figma API → S3 URL
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ images: { '1:2': mockImageUrl } }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(null, { status: 502 }));

    const { GET } = await import('./route');
    const res = await GET(
      createRequest({ fileKey: 'abc', nodeId: '1:2' }, { Authorization: 'Bearer test-token' })
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/download/i);
  });

  it('renders and returns a PNG image when both API calls succeed', async () => {
    const pngBuffer = Buffer.from('fake-png-data');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ images: { '1:2': mockImageUrl } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(pngBuffer, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      );

    const { GET } = await import('./route');
    const res = await GET(
      createRequest({ fileKey: 'abc', nodeId: '1:2' }, { Authorization: 'Bearer test-token' })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    const body = await res.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe('fake-png-data');
  });

  it('surfaces Figma API rate-limit headers on 429', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ err: 'Rate limited' }), {
        status: 429,
        headers: {
          'Retry-After': '30',
          'X-Figma-Plan-Tier': 'free',
          'X-Figma-Rate-Limit-Type': 'professional_v1',
        },
      })
    );

    const { GET } = await import('./route');
    const res = await GET(
      createRequest({ fileKey: 'abc', nodeId: '1:2' }, { Authorization: 'Bearer test-token' })
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.retryAfter).toBe(30);
    expect(body.planTier).toBe('free');
    expect(body.limitType).toBe('professional_v1');
  });

  it('renders SVG when format=svg', async () => {
    const svgContent = '<svg></svg>';
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ images: { '1:2': mockImageUrl } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(svgContent, {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml' },
        })
      );

    const { GET } = await import('./route');
    const res = await GET(
      createRequest(
        { fileKey: 'abc', nodeId: '1:2', format: 'svg' },
        { Authorization: 'Bearer test-token' }
      )
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('accepts token from query parameter as fallback', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ images: { '1:2': mockImageUrl } }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(Buffer.from('data'), { status: 200 }));

    const { GET } = await import('./route');
    const res = await GET(createRequest({ fileKey: 'abc', nodeId: '1:2', token: 'query-token' }));
    expect(res.status).toBe(200);

    // Verify query token was used instead of Bearer header
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const figmaUrl = fetchMock.mock.calls[0][0] as string;
    expect(figmaUrl).toContain('/images/abc?ids=1:2');
    const figmaOpts = fetchMock.mock.calls[0][1] as RequestInit;
    expect((figmaOpts.headers as Record<string, string>).Authorization).toBe('Bearer query-token');
  });
});
