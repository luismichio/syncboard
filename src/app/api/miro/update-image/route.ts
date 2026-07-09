import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { figmaToken, miroToken, boardId, itemId, fileKey, nodeId, nodeName, width, dataUrl } =
      await request.json();

    if (!miroToken || !boardId || !itemId || !fileKey || !nodeId || !nodeName) {
      return NextResponse.json(
        { error: 'Missing required parameters in request body' },
        { status: 400 }
      );
    }

    let arrayBuffer: ArrayBuffer;

    if (dataUrl) {
      // --- Fast path: client pre-fetched the image, skip the Figma API call entirely ---
      const base64 = (dataUrl as string).split(',')[1];
      const binary = Buffer.from(base64, 'base64');
      arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    } else {
      // --- Fallback: fetch render URL from Figma (single-image imports) ---
      if (!figmaToken) {
        return NextResponse.json({ error: 'Missing Figma token' }, { status: 401 });
      }

      const figmaApiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&scale=2&format=png`;
      const figmaResponse = await fetch(figmaApiUrl, {
        headers: { Authorization: `Bearer ${figmaToken}` },
      });

      const figmaData = await figmaResponse.json();

      if (!figmaResponse.ok) {
        const retryAfter = figmaResponse.headers.get('Retry-After');
        const planTier = figmaResponse.headers.get('X-Figma-Plan-Tier');
        const limitType = figmaResponse.headers.get('X-Figma-Rate-Limit-Type');
        const baseError = figmaData.err || figmaData.message || 'Rate limit exceeded';
        return NextResponse.json(
          {
            error: baseError,
            retryAfter: retryAfter ? Number(retryAfter) : null,
            planTier,
            limitType,
          },
          { status: figmaResponse.status }
        );
      }

      const imageUrl = figmaData.images[nodeId];
      if (!imageUrl) {
        return NextResponse.json(
          { error: 'Figma returned no image URL during update' },
          { status: 404 }
        );
      }

      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to download the updated image file from Figma' },
          { status: 502 }
        );
      }

      arrayBuffer = await imageResponse.arrayBuffer();
    }

    // Build multipart form data for Miro PATCH
    const formData = new FormData();
    const file = new File([arrayBuffer], 'screenshot.png', { type: 'image/png' });
    formData.append('resource', file);

    const titleTag = `[SyncBoard|${fileKey}|${nodeId}] ${nodeName}`;
    const dataPayload: { title: string; geometry?: { width: number } } = { title: titleTag };
    if (width) {
      dataPayload.geometry = { width: Math.round(Number(width)) };
    }
    formData.append('data', JSON.stringify(dataPayload));

    const miroApiUrl = `https://api.miro.com/v2/boards/${boardId}/images/${itemId}`;
    const miroResponse = await fetch(miroApiUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${miroToken}` },
      body: formData,
    });

    const miroData = await miroResponse.json();

    if (!miroResponse.ok) {
      return NextResponse.json(
        { error: miroData.message || 'Miro image update failed' },
        { status: miroResponse.status }
      );
    }

    return NextResponse.json({ success: true, item: miroData });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
