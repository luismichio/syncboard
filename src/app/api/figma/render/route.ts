import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fileKey = searchParams.get('fileKey');
  const nodeId = searchParams.get('nodeId');

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
    // 1. Request image render URL from Figma (scale 2x for high quality)
    const figmaApiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&scale=2&format=png`;
    const figmaResponse = await fetch(figmaApiUrl, {
      headers: {
        Authorization: `Bearer ${figmaToken}`,
      },
    });

    const figmaData = await figmaResponse.json();

    if (!figmaResponse.ok) {
      const retryAfter = figmaResponse.headers.get('Retry-After');
      const retryMsg = retryAfter ? ` Please wait ${retryAfter}s before retrying.` : '';
      const baseError = figmaData.err || figmaData.message || 'Figma image rendering failed';
      return NextResponse.json(
        { error: `${baseError}.${retryMsg}` },
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

    // 3. Stream the raw binary PNG back to the client
    return new NextResponse(Buffer.from(arrayBuffer), {
      headers: {
        'Content-Type': 'image/png',
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
