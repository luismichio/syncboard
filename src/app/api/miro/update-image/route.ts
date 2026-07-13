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

    // Build multipart form data for Miro PATCH
    const formData = new FormData();
    
    // Choose correct content type and file name for the payload
    const mimeType = format === 'svg' ? 'image/svg+xml' : 'image/png';
    const safeName = nodeName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'screenshot';
    const fileName = format === 'svg' ? `${safeName}.svg` : `${safeName}.png`;
    
    const file = new File([arrayBuffer], fileName, { type: mimeType });
    formData.append('resource', file);

    const tag = platform === 'penpot' ? 'PenpotSync' : 'SyncBoard';
    const titleTag = `${nodeName} [${tag}|${fileKey}|${nodeId}]`;

    const miroApiUrl = `https://api.miro.com/v2/boards/${boardId}/images/${itemId}`;
    const authHeaders = { Authorization: `Bearer ${miroToken}` };

    // Single PATCH: upload resource, title, AND geometry in one call.
    // This works for most cases (Figma PNG). When Miro overrides geometry
    // (Penpot SVG), the supplementary retry loop below catches it.
    const dataPayload: { title: string; geometry?: { width: number } } = { title: titleTag };
    if (width) {
      dataPayload.geometry = { width: Math.round(Number(width)) };
    }
    formData.append('data', JSON.stringify(dataPayload));

    const uploadResponse = await fetch(miroApiUrl, {
      method: 'PATCH',
      headers: authHeaders,
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errData = await uploadResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.message || 'Miro image update failed' },
        { status: uploadResponse.status }
      );
    }

    // Supplementary geometry retry: if width was requested, verify it stuck.
    // Miro's async image processing can override geometry even when sent in
    // the same PATCH (especially for SVG items).
    if (width) {
      const targetWidth = Math.round(Number(width));
      const MAX_RETRIES = 5;
      const RETRY_DELAY_MS = 800;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

        // Re-apply geometry
        const geoForm = new FormData();
        geoForm.append('data', JSON.stringify({
          geometry: { width: targetWidth },
        }));

        await fetch(miroApiUrl, {
          method: 'PATCH',
          headers: authHeaders,
          body: geoForm,
        }).catch(() => {});

        // Verify
        const verifyRes = await fetch(miroApiUrl, { headers: authHeaders }).catch(() => null);
        if (verifyRes && verifyRes.ok) {
          const widget = await verifyRes.json().catch(() => ({})) as { width?: number };
          if (widget && typeof widget.width === 'number' && Math.round(widget.width) === targetWidth) {
            break; // Confirmed
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
