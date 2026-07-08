import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileKey = searchParams.get('fileKey');
    const nodeId = searchParams.get('nodeId');
    const token = request.headers.get('Authorization'); // Figma OAuth Token

    if (!fileKey || !nodeId || !token) {
      return NextResponse.json(
        { error: 'Missing required parameters (fileKey, nodeId, or Authorization header)' },
        { status: 400 }
      );
    }

    // Call Figma's REST API to get node details (including the document name)
    const figmaUrl = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`;
    const response = await fetch(figmaUrl, {
      headers: {
        Authorization: token,
      },
    });

    if (!response.ok) {
      // Return a fallback name if the file isn't found or unauthorized
      return NextResponse.json({ name: 'Pasted Screen' });
    }

    const data = await response.json();
    const node = data.nodes?.[nodeId]?.document;
    const name = node?.name || 'Pasted Screen';

    return NextResponse.json({ name });
  } catch (err: any) {
    console.error('Figma node info query failed:', err);
    return NextResponse.json({ name: 'Pasted Screen' });
  }
}
