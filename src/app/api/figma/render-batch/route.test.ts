import { describe, it, expect, vi, beforeEach } from 'vitest';

function createPostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/figma/render-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockS3Url = 'https://figma-s3.example.com/render.png';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/figma/render-batch', () => {
  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('./route');
    const res = await POST(createPostRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 400 when nodeIds is not an array', async () => {
    const { POST } = await import('./route');
    const res = await POST(createPostRequest({
      figmaToken: 'tok',
      fileKey: 'abc',
      nodeIds: 'not-an-array',
    }));
    expect(res.status).toBe(400);
  });

  it('returns images as base64 data URLs for all nodeIds', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      // Single batch Figma API call
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            images: { '1:2': mockS3Url, '3:4': `${mockS3Url}2` },
          }),
          { status: 200 }
        )
      )
      // Two parallel S3 fetches
      .mockResolvedValueOnce(new Response(Buffer.from('png1'), { status: 200 }))
      .mockResolvedValueOnce(new Response(Buffer.from('png2'), { status: 200 }));

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        figmaToken: 'tok',
        fileKey: 'abc',
        nodeIds: ['1:2', '3:4'],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.images).toBeDefined();
    expect(body.images['1:2']).toContain('data:image/png;base64,');

    // Verify single batch call to Figma with comma-separated node IDs
    const figmaUrl = fetchMock.mock.calls[0][0] as string;
    expect(figmaUrl).toContain('ids=1:2,3:4');
  });

  it('handles partial S3 download failures gracefully', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ images: { '1:2': mockS3Url, '3:4': `${mockS3Url}2` } }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 502 })) // first S3 fails
      .mockResolvedValueOnce(new Response(Buffer.from('ok'), { status: 200 })); // second S3 ok

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        figmaToken: 'tok',
        fileKey: 'abc',
        nodeIds: ['1:2', '3:4'],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.images['1:2']).toBeNull();
    expect(body.images['3:4']).toContain('data:image/png;base64,');
  });

  it('surfaces Figma rate-limit headers on 429', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ err: 'Too many requests' }), {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-Figma-Plan-Tier': 'free',
          'X-Figma-Rate-Limit-Type': 'professional_v1',
        },
      })
    );

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        figmaToken: 'tok',
        fileKey: 'abc',
        nodeIds: ['1:2'],
      })
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.retryAfter).toBe(60);
    expect(body.planTier).toBe('free');
  });

  it('renders SVG when format=svg', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ images: { '1:2': mockS3Url } }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(Buffer.from('<svg/>'), { status: 200 }));

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        figmaToken: 'tok',
        fileKey: 'abc',
        nodeIds: ['1:2'],
        format: 'svg',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.images['1:2']).toContain('data:image/svg+xml;base64,');
  });
});
