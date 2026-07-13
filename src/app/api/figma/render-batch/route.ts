import { NextResponse } from 'next/server';

/**
 * POST /api/figma/render-batch
 *
 * Accepts multiple nodeIds from the same file and fetches their renders
 * in a SINGLE Figma API call, dramatically reducing quota consumption.
 * Supports dynamic format and scale selection per batch group.
 *
 * Body: { fileKey, nodeIds: string[], format?: string, scale?: number }
 * Auth: token via Authorization: Bearer <figmaToken> (not in body)
 * Returns: { images: { [nodeId]: dataUrl } }
 */
export async function POST(request: Request) {
  try {
    // Read token from Authorization header instead of body (security)
    const authHeader = request.headers.get('Authorization') || '';
    const figmaToken = authHeader.replace(/^Bearer\s+/i, '');
    const body = await request.json();
    const { fileKey, nodeIds, format = 'png', scale = 2 } = body;

    if (!figmaToken || !fileKey || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required parameters: figmaToken (Bearer), fileKey, nodeIds[]' },
        { status: 400 }
      );
    }

    // 1. Single batched Figma API call with all node IDs comma-separated
    const idsParam = nodeIds.join(',');
    const scaleQuery = format === 'svg' ? '' : `&scale=${scale ? Number(scale) : 2}`;
    const figmaApiUrl = `https://api.figma.com/v1/images/${fileKey}?ids=${idsParam}${scaleQuery}&format=${format}`;

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

    const imageUrls: Record<string, string> = figmaData.images || {};
    const mimePrefix = format === 'svg' ? 'data:image/svg+xml;base64,' : 'data:image/png;base64,';

    // 2. Download each S3 image and convert to base64 data URL in parallel
    const entries = await Promise.all(
      nodeIds.map(async (nodeId: string) => {
        const s3Url = imageUrls[nodeId];
        if (!s3Url) {
          return [nodeId, null] as [string, null];
        }
        try {
          const imgRes = await fetch(s3Url);
          if (!imgRes.ok) return [nodeId, null] as [string, null];
          const arrayBuffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          return [nodeId, `${mimePrefix}${base64}`] as [string, string];
        } catch {
          return [nodeId, null] as [string, null];
        }
      })
    );

    const images: Record<string, string | null> = Object.fromEntries(entries);
    return NextResponse.json({ images });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
