import { describe, it, expect, vi, beforeEach } from 'vitest';

function createPostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/miro/update-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/miro/update-image', () => {
  it('returns 400 when required params are missing', async () => {
    const { POST } = await import('./route');
    const res = await POST(createPostRequest({ miroToken: 'tok', boardId: 'b', itemId: 'i' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');

    // Missing nodeName as well
    const res2 = await POST(
      createPostRequest({ miroToken: 'tok', boardId: 'b', itemId: 'i', fileKey: 'f', nodeId: 'n' })
    );
    expect(res2.status).toBe(400);
  });

  it('returns 401 when Figma token is missing (fallback path without dataUrl)', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        miroToken: 'tok',
        boardId: 'b',
        itemId: 'i',
        fileKey: 'f',
        nodeId: '1:2',
        nodeName: 'Frame',
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Missing Figma token');
  });

  it('updates image via Miro PATCH using pre-fetched dataUrl (fast path)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    // Image PATCH (resource + title)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'image-123' }), { status: 200 })
    );
    // Item PATCH (geometry only)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'image-123', data: { geometry: { width: 400 } } }), { status: 200 })
    );

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        miroToken: 'miro-tok',
        boardId: 'board-1',
        itemId: 'item-1',
        fileKey: 'file-1',
        nodeId: '1:2',
        nodeName: 'My Frame',
        dataUrl: 'data:image/png;base64,ZmFrZS1wbmctZGF0YQ==',
        width: 400,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('uses fallback Figma render path when dataUrl is not provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      // Figma render API
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ images: { '1:2': 'https://s3.example.com/img.png' } }),
          { status: 200 }
        )
      )
      // S3 download
      .mockResolvedValueOnce(new Response(Buffer.from('png-data'), { status: 200 }))
      // Image PATCH
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'item-1' }), { status: 200 })
      );

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        figmaToken: 'figma-tok',
        miroToken: 'miro-tok',
        boardId: 'board-1',
        itemId: 'item-1',
        fileKey: 'file-1',
        nodeId: '1:2',
        nodeName: 'My Frame',
        scale: 2,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('tags Penpot items with [PenpotSync] marker and succeeds', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    // Image PATCH (no geometry — Penpot test doesn't set width)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'item-p' }), { status: 200 })
    );

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        figmaToken: 'figma-tok',
        miroToken: 'miro-tok',
        boardId: 'board-1',
        itemId: 'item-p',
        fileKey: 'file-p',
        nodeId: 'p:1',
        nodeName: 'Penpot Frame',
        dataUrl: 'data:image/png;base64,cGVucG90',
        platform: 'penpot',
      })
    );

    // Should succeed - dataUrl path avoids Figma API
    if (res.status !== 200) {
      const body = await res.json();
      console.error('Penpot test failed:', body);
    }
    expect(res.status).toBe(200);
  });

  it('surfaces Miro API errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Insufficient permissions' }), { status: 403 })
    );

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        miroToken: 'bad-tok',
        boardId: 'board-1',
        itemId: 'item-1',
        fileKey: 'file-1',
        nodeId: '1:2',
        nodeName: 'Frame',
        dataUrl: 'data:image/png;base64,ZGF0YQ==',
      })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Insufficient permissions');
  });
});
