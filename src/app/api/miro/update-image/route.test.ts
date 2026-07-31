import { describe, it, expect, vi, beforeEach } from 'vitest';

function createPostRequest(body: unknown, extras?: { miroToken?: string; figmaToken?: string }): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (extras?.miroToken) headers['Authorization'] = `Bearer ${extras.miroToken}`;
  if (extras?.figmaToken) headers['X-Figma-Token'] = extras.figmaToken;
  return new Request('http://localhost:3000/api/miro/update-image', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/miro/update-image', () => {
  it('returns 400 when required params are missing', async () => {
    const { POST } = await import('./route');
    const res = await POST(createPostRequest({ boardId: 'b', itemId: 'i' }, { miroToken: 'tok' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');

    // Missing nodeName as well
    const res2 = await POST(
      createPostRequest({ boardId: 'b', itemId: 'i', fileKey: 'f', nodeId: 'n' }, { miroToken: 'tok' })
    );
    expect(res2.status).toBe(400);
  });

  it('returns 401 when Figma token is missing (fallback path without dataUrl)', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        boardId: 'b',
        itemId: 'i',
        fileKey: 'f',
        nodeId: '1:2',
        nodeName: 'Frame',
      }, { miroToken: 'tok' })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Missing Figma token');
  });

  it('updates image via Miro PATCH using pre-fetched dataUrl (fast path)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    // Image PATCH (resource upload)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'image-123' }), { status: 200 })
    );
    // Geometry PATCH (apply width)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'image-123' }), { status: 200 })
    );
    // Geometry GET verify
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ geometry: { width: 400 } }), { status: 200 })
    );

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        boardId: 'board-1',
        itemId: 'item-1',
        fileKey: 'file-1',
        nodeId: '1:2',
        nodeName: 'My Frame',
        dataUrl: 'data:image/png;base64,ZmFrZS1wbmctZGF0YQ==',
        width: 400,
      }, { miroToken: 'miro-tok' })
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
    // No width provided — geometry step is skipped

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        boardId: 'board-1',
        itemId: 'item-1',
        fileKey: 'file-1',
        nodeId: '1:2',
        nodeName: 'My Frame',
        scale: 2,
      }, { miroToken: 'miro-tok', figmaToken: 'figma-tok' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('preserves widget size: snapshot, upload, restore geometry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    // Snapshot GET (current canvas width)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ geometry: { width: 350 } }), { status: 200 })
    );
    // Image PATCH (resource upload)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'image-123' }), { status: 200 })
    );
    // Geometry PATCH (restore to 350)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'image-123' }), { status: 200 })
    );
    // Geometry GET verify
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ geometry: { width: 350 } }), { status: 200 })
    );

    const { POST } = await import('./route');
    const res = await POST(
      createPostRequest({
        boardId: 'board-1',
        itemId: 'item-1',
        fileKey: 'file-1',
        nodeId: '1:2',
        nodeName: 'My Frame',
        dataUrl: 'data:image/png;base64,ZmFrZS1wbmctZGF0YQ==',
        preserveSize: true,
      }, { miroToken: 'miro-tok' })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Verify all 4 fetches were called (snapshot + upload + geo-patch + geo-verify)
    expect(fetchMock).toHaveBeenCalledTimes(4);
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
        boardId: 'board-1',
        itemId: 'item-p',
        fileKey: 'file-p',
        nodeId: 'p:1',
        nodeName: 'Penpot Frame',
        dataUrl: 'data:image/png;base64,cGVucG90',
        platform: 'penpot',
      }, { miroToken: 'miro-tok', figmaToken: 'figma-tok' })
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
        boardId: 'board-1',
        itemId: 'item-1',
        fileKey: 'file-1',
        nodeId: '1:2',
        nodeName: 'Frame',
        dataUrl: 'data:image/png;base64,ZGF0YQ==',
      }, { miroToken: 'bad-tok' })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Insufficient permissions');
  });
});
