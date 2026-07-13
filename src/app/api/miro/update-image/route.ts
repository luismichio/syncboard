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

    // Step 1: Update the image resource (and title) without geometry.
    // When resource + geometry are sent together, Miro ignores geometry and
    // recalculates dimensions from the new image's pixel size.
    const uploadForm = new FormData();
    uploadForm.append('resource', file);
    uploadForm.append('data', JSON.stringify({ title: titleTag }));

    const uploadResponse = await fetch(miroApiUrl, {
      method: 'PATCH',
      headers: authHeaders,
      body: uploadForm,
    });

    if (!uploadResponse.ok) {
      const errData = await uploadResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.message || 'Miro image upload failed' },
        { status: uploadResponse.status }
      );
    }

    // Step 2: Apply geometry with retry loop.
    // Miro's async image processing overrides geometry.width even when sent in
    // a separate PATCH. We keep retrying until a GET confirms the widget has
    // the correct width, or until max attempts are exhausted.
    if (width) {
      const targetWidth = Math.round(Number(width));
      const MAX_RETRIES = 8;
      const RETRY_DELAY_MS = 1000;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        // Wait before each attempt (first attempt waits too, letting Miro settle)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));

        // Apply geometry
        const geoForm = new FormData();
        geoForm.append('data', JSON.stringify({
          geometry: { width: targetWidth },
        }));

        const geoRes = await fetch(miroApiUrl, {
          method: 'PATCH',
          headers: authHeaders,
          body: geoForm,
        });

        if (!geoRes.ok) {
          const errData = await geoRes.json().catch(() => ({}));
          console.warn(`Miro geometry PATCH #${attempt} failed:`, errData.message);
          continue;
        }

        // Verify by fetching the widget and checking its width
        const verifyRes = await fetch(miroApiUrl, { headers: authHeaders });
        if (verifyRes.ok) {
          const widget = await verifyRes.json() as { width?: number };
          if (widget && typeof widget.width === 'number' && Math.round(widget.width) === targetWidth) {
            // Width confirmed — done
            break;
          }
          console.warn(`Miro geometry #${attempt}: widget.width=${widget?.width} !== target=${targetWidth}, retrying...`);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
