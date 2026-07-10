import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileKey = searchParams.get('fileKey');
  const nodeId = searchParams.get('nodeId');
  const format = searchParams.get('format') || 'png';
  const scaleParam = searchParams.get('scale');
  
  // Read token from Authorization header, or query parameters as fallback
  let figmaToken = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!figmaToken) {
    const authQuery = searchParams.get('Authorization');
    if (authQuery) {
      figmaToken = authQuery.replace('Bearer ', '');
    } else {
      figmaToken = searchParams.get('token') || undefined;
    }
  }

  if (!fileKey || !nodeId) {
    return NextResponse.json(
      { error: 'Missing fileKey or nodeId query parameters' },
      { status: 400 }
    );
  }

  if (!figmaToken) {
    return NextResponse.json(
      { error: 'Missing Figma Authorization token' },
      { status: 401 }
    );
  }

  try {
    // 1. Request image render URL from Figma
    // Figma ignores the scale parameter if format is svg
    const scaleQuery = format === 'svg' ? '' : `&scale=${scaleParam ? Number(scaleParam) : 2}`;
    const figmaApiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}${scaleQuery}&format=${format}`;
    
    const figmaResponse = await fetch(figmaApiUrl, {
      headers: {
        Authorization: `Bearer ${figmaToken}`,
      },
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
        { error: 'Figma returned no image URL for the specified node ID.' },
        { status: 404 }
      );
    }

    // 2. Fetch the binary image file from S3
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to download the rendered image file from Figma storage' },
        { status: 502 }
      );
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const contentType = format === 'svg' ? 'image/svg+xml' : 'image/png';

    // 3. Stream the raw binary image back to the client
    return new NextResponse(Buffer.from(arrayBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
