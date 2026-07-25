import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';

function decodeHtmlEntities(value: string): string {
  const NAMED_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };
  let result = value;
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    result = result.split(entity).join(char);
  }
  result = result.replace(/&#(\d+);/g, (_match, dec) => {
    const code = parseInt(dec, 10);
    if (code < 32 && code !== 10 && code !== 13) return _match;
    return String.fromCharCode(code);
  });
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
    const code = parseInt(hex, 16);
    if (code < 32 && code !== 10 && code !== 13) return _match;
    return String.fromCharCode(code);
  });
  return result;
}

async function handler(request: Request) {
  try {
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
      preserveSize = false
    } = await request.json();

    if (!miroToken || !boardId || !itemId || !fileKey || !nodeId || !nodeName) {
      return NextResponse.json(
        { error: 'Missing required parameters (miroToken via Authorization header, boardId, itemId, fileKey, nodeId, nodeName)' },
        { status: 400 }
      );
    }

    let arrayBuffer: ArrayBuffer;

    if (dataUrl) {
      // Fast path: client pre-fetched the image
      const base64 = (dataUrl as string).split(',')[1];
      const binary = Buffer.from(base64, 'base64');
      arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    } else {
      // Fallback: fetch render URL from Figma (single-image imports)
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

    // Decode nodeName for safe filename and title
    const decodedNodeName = decodeHtmlEntities(String(nodeName));
    const safeName = decodedNodeName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'screenshot';
    const mimeType = format === 'svg' ? 'image/svg+xml' : 'image/png';
    const fileName = format === 'svg' ? `${safeName}.svg` : `${safeName}.png`;
    const file = new File([arrayBuffer], fileName, { type: mimeType });

    const authHeaders = { Authorization: `Bearer ${miroToken}` };

    // Step 1: Upload the image resource.
    // NOTE: title is deliberately NOT sent here — Miro's REST API may HTML-encode
    // title strings differently from the Miro SDK. The widget title is set exclusively
    // via miro.board.createImage({ title }) during import and preserved here by omitting
    // it from the PATCH. This prevents the "flicker" where the title briefly shows
    // correctly then reverts to an HTML-encoded form.
    const imageForm = new FormData();
    imageForm.append('resource', file);

    const imageData: Record<string, unknown> = {};
    if (preserveSize) {
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

    // Step 2: Apply geometry via the generic item update endpoint (JSON body)
    // only when preserveSize is NOT active.
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
