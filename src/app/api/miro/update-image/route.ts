import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { 
      figmaToken, 
      miroToken, 
      boardId, 
      itemId, 
      fileKey, 
      nodeId, 
      nodeName, 
      width, 
      dataUrl,
      format = 'png',
      scale = 2,
      platform = 'figma'
    } = await request.json();

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

      const scaleQuery = format === 'svg' ? '' : `&scale=${scale ? Number(scale) : 2}`;
      const figmaApiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}${scaleQuery}&format=${format}`;
      
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

    // Build multipart form data for Miro image PATCH
    const formData = new FormData();
    
    const mimeType = format === 'svg' ? 'image/svg+xml' : 'image/png';
    const safeName = nodeName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'screenshot';
    const fileName = format === 'svg' ? `${safeName}.svg` : `${safeName}.png`;
    
    const file = new File([arrayBuffer], fileName, { type: mimeType });
    formData.append('resource', file);

    const tag = platform === 'penpot' ? 'PenpotSync' : 'SyncBoard';
    const titleTag = `${nodeName} [${tag}|${fileKey}|${nodeId}]`;

    const authHeaders = { Authorization: `Bearer ${miroToken}` };

    // Step 1: Upload the image via the image-specific multipart endpoint.
    // Title is included here; geometry is NOT sent because Miro's image
    // processing overrides geometry.width when a new resource is supplied.
    const imageForm = new FormData();
    imageForm.append('resource', file);
    imageForm.append('data', JSON.stringify({ title: titleTag }));

    const imageUrl_ = `https://api.miro.com/v2/boards/${boardId}/images/${itemId}`;
    const imageRes = await fetch(imageUrl_, {
      method: 'PATCH',
      headers: authHeaders,
      body: imageForm,
    });

    if (!imageRes.ok) {
      const errData = await imageRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.message || 'Miro image upload failed' },
        { status: imageRes.status }
      );
    }

    // Step 2: Apply geometry via the generic item update endpoint (JSON body).
    // This endpoint handles geometry differently from the image-specific one —
    // it updates the widget's data model directly without triggering image processing.
    if (width) {
      const targetWidth = Math.round(Number(width));
      const itemUrl = `https://api.miro.com/v2/boards/${boardId}/items/${itemId}`;

      const geometryRes = await fetch(itemUrl, {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            geometry: { width: targetWidth },
          },
        }),
      });

      if (!geometryRes.ok) {
        const errData = await geometryRes.json().catch(() => ({}));
        console.warn('Miro item geometry update failed (image already uploaded):', errData.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error during Miro image update:', err);
    return NextResponse.json({ error: 'Internal Server Error during Miro image update' }, { status: 500 });
  }
}
