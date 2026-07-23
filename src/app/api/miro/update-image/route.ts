import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';

async function handler(request: Request) {
  try {
    // Read tokens from headers instead of body (backlog #6: header-based token transmission)
    const miroToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    const figmaToken = request.headers.get('X-Figma-Token') || '';

    const {
      boardId,
      itemId,
      fileKey,
      nodeId,
      nodeName,
      width,
      dataUrl,
      format = 'png',
      scale = 2,
      platform = 'figma',
      preserveSize = false
    } = await request.json();

    if (!miroToken || !boardId || !itemId || !fileKey || !nodeId || !nodeName) {
      return NextResponse.json(
        { error: 'Missing required parameters (miroToken via Authorization header, boardId, itemId, fileKey, nodeId, nodeName)' },
        { status: 400 }
      );
    }

    // ── Preserve Size: snapshot current widget properties BEFORE upload ──
    // Miro's image PATCH recalculates widget dimensions and resets style.crop
    // when a new resource is supplied. To prevent this, we capture the current
    // geometry + style and include them in the image PATCH data field so Miro
    // applies them atomically with the upload — no race conditions possible.
    let originalGeometry: { width: number; height: number } | null = null;
    let originalStyle: Record<string, unknown> | null = null;

    if (preserveSize) {
      try {
        const itemUrl = `https://api.miro.com/v2/boards/${boardId}/items/${itemId}`;
        const itemRes = await fetch(itemUrl, {
          headers: { Authorization: `Bearer ${miroToken}` },
        });
        if (itemRes.ok) {
          const itemData = await itemRes.json();
          // geometry is at the top level of the Miro API response
          if (itemData.geometry?.width) {
            originalGeometry = {
              width: Math.round(itemData.geometry.width),
              height: itemData.geometry.height ? Math.round(itemData.geometry.height) : Math.round(itemData.geometry.width),
            };
          }
          // Capture full style object so crop, borders, fill, etc. survive
          if (itemData.style) {
            originalStyle = { ...itemData.style };
          }
        }
      } catch (err) {
        console.warn('Failed to snapshot widget geometry before image update:', err);
      }
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

    const mimeType = format === 'svg' ? 'image/svg+xml' : 'image/png';
    const safeName = nodeName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'screenshot';
    const fileName = format === 'svg' ? `${safeName}.svg` : `${safeName}.png`;
    const file = new File([arrayBuffer], fileName, { type: mimeType });

    const tag = platform === 'penpot' ? 'PenpotSync' : 'SyncBoard';
    const titleTag = `${nodeName} [${tag}|${fileKey}|${nodeId}]`;
    const authHeaders = { Authorization: `Bearer ${miroToken}` };

    // Step 1: Upload the image via the image-specific multipart endpoint.
    // When preserveSize is active, include the original geometry and style
    // in the data field so Miro applies them atomically with the resource
    // upload — no separate restore call needed, no race condition.
    const imageForm = new FormData();
    imageForm.append('resource', file);

    const imageData: Record<string, unknown> = { title: titleTag };
    if (preserveSize && originalGeometry) {
      // Miro's image PATCH only accepts geometry.width for images;
      // height is auto-calculated from aspect ratio. Sending height
      // causes 400 'Invalid parameters'.
      imageData.geometry = { width: originalGeometry.width };
      // Send only style.fit (not the full captured style) to avoid
      // conflicts with Miro's resource processing. Crop is preserved
      // because we only set fit, leaving all other style fields untouched.
      imageData.style = { fit: 'contain' };
    }

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

    // Step 2: When preserveSize is NOT active, apply the requested geometry.
    if (width && !preserveSize) {
      const targetWidth = Math.round(Number(width));
      const itemUrl = `https://api.miro.com/v2/boards/${boardId}/items/${itemId}`;
      const geometryRes = await fetch(itemUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
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
    } else if (preserveSize && originalGeometry) {
      // Step 2a: Verify geometry stuck, retry if Miro's async processing overrode it
      const itemUrl = `https://api.miro.com/v2/boards/${boardId}/items/${itemId}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 600));

        const verifyRes = await fetch(itemUrl, {
          headers: authHeaders,
        });
        if (!verifyRes.ok) continue;

        const verifyData = await verifyRes.json();
        const currentW = verifyData.geometry?.width;
        const currentH = verifyData.geometry?.height;

        if (
          currentW === originalGeometry.width &&
          currentH === originalGeometry.height
        ) {
          break; // Geometry confirmed
        }

        // Geometry doesn't match — restore it again
        const geometryRes = await fetch(itemUrl, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            data: { geometry: originalGeometry },
          }),
        });
        if (!geometryRes.ok) {
          console.warn(`Attempt ${attempt + 1}/3: failed to restore geometry`);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error during Miro image update:', err);
    return NextResponse.json({ error: 'Internal Server Error during Miro image update' }, { status: 500 });
  }
}

export const POST = withRateLimit({ endpoint: "miro:update-image" })(handler);
