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

    // ── Preserve Size: snapshot current geometry BEFORE upload ──
    // Miro's image PATCH recalculates widget dimensions when a new resource is supplied,
    // so we must read and restore the original geometry to keep the widget unchanged.
    let originalWidth: number | null = null;
    let originalHeight: number | null = null;

    if (preserveSize) {
      try {
        const itemUrl = `https://api.miro.com/v2/boards/${boardId}/items/${itemId}`;
        const itemRes = await fetch(itemUrl, {
          headers: { Authorization: `Bearer ${miroToken}` },
        });
        if (itemRes.ok) {
          const itemData = await itemRes.json();
          // Miro returns geometry in two forms depending on the item type.
          // Images store width/height at the top level (data.width / data.height)
          // and also in data.geometry.
            // geometry is at the top level of the Miro API response, not inside data
          originalWidth = itemData.geometry?.width ?? null;
          originalHeight = itemData.geometry?.height ?? null;
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
    const imageForm = new FormData();
    imageForm.append('resource', file);

    const imageData: Record<string, unknown> = { title: titleTag };
    if (preserveSize) {
      // style.fit controls how the image renders within the widget bounds.
      // "contain" prevents stretching when the new image has a different aspect ratio.
      imageData.style = { fit: 'contain' };
    }
    imageForm.append('data', JSON.stringify(imageData));

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

    // Step 2a: When preserveSize is active, restore the original geometry.
    // Miro's image PATCH endpoint may recalculate widget dimensions when a new
    // resource is supplied, and image processing can be asynchronous. We retry
    // the geometry restore up to 3 times to handle race conditions.
    if (preserveSize && (originalWidth || originalHeight)) {
      const geometry: Record<string, number> = {};
      if (originalWidth) geometry.width = Math.round(originalWidth);
      if (originalHeight) geometry.height = Math.round(originalHeight);

      const itemUrl = `https://api.miro.com/v2/boards/${boardId}/items/${itemId}`;

      for (let attempt = 0; attempt < 3; attempt++) {
        // Small delay before geometry restore and between retries
        if (attempt > 0) await new Promise(r => setTimeout(r, 600));

        const geometryRes = await fetch(itemUrl, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({
            data: {
              geometry,
            },
          }),
        });

        if (!geometryRes.ok) {
          const errData = await geometryRes.json().catch(() => ({}));
          console.warn(`Attempt ${attempt + 1}/3: failed to restore geometry:`, errData.message);
          continue;
        }

        // Verify the geometry stuck by re-reading the item
        const verifyRes = await fetch(itemUrl, {
          headers: authHeaders,
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          const currentW = verifyData.geometry?.width;
          const currentH = verifyData.geometry?.height;
          if (
            currentW === geometry.width &&
            (!geometry.height || currentH === geometry.height)
          ) {
            break; // Geometry confirmed — no more retries needed
          }
          console.warn(`Attempt ${attempt + 1}/3: geometry mismatch (got ${currentW}x${currentH}, want ${geometry.width}x${geometry.height}), retrying...`);
        }
      }
    }

    // Step 2b: When preserveSize is NOT active, apply the requested geometry.
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
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error during Miro image update:', err);
    return NextResponse.json({ error: 'Internal Server Error during Miro image update' }, { status: 500 });
  }
}

export const POST = withRateLimit({ endpoint: "miro:update-image" })(handler);
