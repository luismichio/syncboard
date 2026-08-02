import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';

async function handler(request: Request) {
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
    const figmaUrl = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`;
    const response = await fetch(figmaUrl, {
      headers: {
        Authorization: token,
      },
    });

    if (!response.ok) {
      // Preserve provider errors so clients can react to 401/403/429.
      // Only a genuine 404 (node/file not found) maps to the Pasted Screen
      // fallback name — pasted content has no source node to look up.
      if (response.status !== 404) {
        const errData = await response.json().catch(() => ({}));
        const retryAfter = response.headers.get('Retry-After');
        return NextResponse.json(
          {
            error:
              (errData as { err?: string })?.err ||
              (errData as { message?: string })?.message ||
              'Figma node query failed',
            retryAfter: retryAfter ? Number(retryAfter) : null,
            planTier: response.headers.get('X-Figma-Plan-Tier'),
            limitType: response.headers.get('X-Figma-Rate-Limit-Type'),
          },
          { status: response.status }
        );
      }
      return NextResponse.json({ name: 'Pasted Screen' });
    }

    const data = await response.json();
    const node = data.nodes?.[nodeId]?.document;
    const name = node?.name || 'Pasted Screen';

    return NextResponse.json({ name });
  } catch (err) {
    console.error('Figma node info query failed:', err);
    // Network/transport failures also keep the fallback name — the import
    // should not be blocked by an optional name enrichment lookup.
    return NextResponse.json({ name: 'Pasted Screen' });
  }
}

export const GET = withRateLimit({ endpoint: "figma:node-info" })(handler);
