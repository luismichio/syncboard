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

    // Validate boardId and itemId format to prevent path injection in Miro API URLs.
    // Real Miro board IDs: alphanumeric + base64url chars (e.g. uXjVM_xyz123=)
    // Real Miro item IDs: large integers as strings (e.g. 3458764523456789)
    const BOARD_ID_RE = /^[A-Za-z0-9_=|-]{1,128}$/;
    const ITEM_ID_RE  = /^[A-Za-z0-9_-]{1,64}$/;
    if (!BOARD_ID_RE.test(String(boardId)) || !ITEM_ID_RE.test(String(itemId))) {
      return NextResponse.json({ error: 'Invalid boardId or itemId format' }, { status: 400 });
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
    const imageUrl_ = `https://api.miro.com/v2/boards/${boardId}/images/${itemId}`;

    // ── Preserve Size: snapshot current geometry BEFORE upload ──
    // Miro recalculates widget dimensions from the new image's intrinsic pixel size
    // when a new resource is supplied. We read the current canvas width now so we can
    // restore it after the upload, locking the widget at its current size.
    let snapshotWidth: number | null = null;
    if (preserveSize) {
      try {
        const snapRes = await fetch(imageUrl_, { headers: authHeaders });
        if (snapRes.ok) {
          const snapData = await snapRes.json() as { geometry?: { width?: number }; width?: number };
          // geometry.width is at the top level of the Miro image API response
          snapshotWidth = snapData.geometry?.width ?? snapData.width ?? null;
        }
      } catch {
        // If snapshot fails, proceed — upload will still succeed at Miro's auto-size
      }
    }

    // Step 1: Upload the image resource (binary replacement).
    // NOTE: title is deliberately NOT sent here — Miro's REST API may HTML-encode
    // title strings differently from the Miro SDK. The widget title is set exclusively
    // via miro.board.createImage({ title }) during import and preserved here by omitting
    // it from the PATCH. This prevents the "flicker" where the title briefly shows
    // correctly then reverts to an HTML-encoded form.
    const imageForm = new FormData();
    imageForm.append('resource', file);
    imageForm.append('data', JSON.stringify({}));
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

    // Step 2: Re-apply geometry after upload.
    // Miro recalculates widget dimensions when a new resource is supplied.
    // We correct this by sending a geometry PATCH on the image-specific endpoint
    // (/images/{id}) using multipart form data — NOT the generic /items/{id}
    // JSON endpoint, which uses a different schema and does not work for images.
    //
    // preserveSize=true  → restore the pre-upload snapshot width (lock canvas size)
    // preserveSize=false → leave image at its new natural size (allows scale changes to expand/shrink canvas)
    const targetWidth: number | null = preserveSize
      ? (snapshotWidth !== null ? Math.round(snapshotWidth) : (width ? Math.round(Number(width)) : null))
      : null;

    if (targetWidth) {
      const MAX_ATTEMPTS = 3;
      const RETRY_DELAY_MS = 800;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));

        const geoForm = new FormData();
        geoForm.append('data', JSON.stringify({ geometry: { width: targetWidth } }));

        const geoRes = await fetch(imageUrl_, {
          method: 'PATCH',
          headers: authHeaders,
          body: geoForm,
        });

        if (!geoRes.ok) {
          const errData = await geoRes.json().catch(() => ({}));
          console.warn(`Geometry PATCH attempt ${attempt + 1}/${MAX_ATTEMPTS} failed:`, errData.message);
          continue;
        }

        // Verify the geometry stuck before declaring success
        const verifyRes = await fetch(imageUrl_, { headers: authHeaders });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json() as { geometry?: { width?: number }; width?: number };
          const confirmedWidth = verifyData.geometry?.width ?? verifyData.width;
          if (confirmedWidth !== undefined && Math.abs(Math.round(confirmedWidth) - targetWidth) <= 1) {
            break; // Width confirmed — done
          }
          console.warn(`Geometry attempt ${attempt + 1}: confirmed=${confirmedWidth}, target=${targetWidth}`);
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
