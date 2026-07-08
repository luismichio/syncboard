import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { figmaToken, miroToken, boardId, itemId, fileKey, nodeId, nodeName } =
      await request.json();

    if (
      !figmaToken ||
      !miroToken ||
      !boardId ||
      !itemId ||
      !fileKey ||
      !nodeId ||
      !nodeName
    ) {
      return NextResponse.json(
        { error: 'Missing required parameters in request body' },
        { status: 400 }
      );
    }

    // 1. Fetch the image render URL from Figma (scale 2x)
    const figmaApiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&scale=2&format=png`;
    const figmaResponse = await fetch(figmaApiUrl, {
      headers: {
        Authorization: `Bearer ${figmaToken}`,
      },
    });

    const figmaData = await figmaResponse.json();

    if (!figmaResponse.ok) {
      return NextResponse.json(
        { error: figmaData.err || 'Figma image rendering failed during update' },
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

    // 2. Download the binary file from Figma S3
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to download the updated image file from Figma' },
        { status: 502 }
      );
    }

    const imageBlob = await imageResponse.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();

    // 3. Prepare the multipart form data for Miro
    const formData = new FormData();
    
    // Attach the file resource. We must cast the ArrayBuffer/Blob properly for the fetch payload
    const file = new File([arrayBuffer], 'screenshot.png', { type: 'image/png' });
    formData.append('resource', file);

    // Attach the updated metadata (keeping the SyncBoard tracking title)
    const titleTag = `[SyncBoard|${fileKey}|${nodeId}] ${nodeName}`;
    formData.append('data', JSON.stringify({ title: titleTag }));

    // 4. Send the PATCH request to Miro REST API v2
    const miroApiUrl = `https://api.miro.com/v2/boards/${boardId}/images/${itemId}`;
    const miroResponse = await fetch(miroApiUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${miroToken}`,
        // Note: Do NOT set Content-Type header manually when sending FormData;
        // the browser/node fetch client automatically sets multipart/form-data with the boundary.
      },
      body: formData,
    });

    const miroData = await miroResponse.json();

    if (!miroResponse.ok) {
      return NextResponse.json(
        { error: miroData.message || 'Miro image update failed' },
        { status: miroResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      item: miroData,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
