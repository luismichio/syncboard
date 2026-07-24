import { NextResponse } from 'next/server';

/**
 * Lightweight Figma token verification endpoint.
 * Calls Figma's /v1/me endpoint to check if the provided token is still valid.
 * Used by the Miro plugin to detect stale/revoked tokens without requiring
 * a file-specific API call.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  try {
    const response = await fetch('https://api.figma.com/v1/me', {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return NextResponse.json({ valid: true });
    }

    // 401/403 — token is invalid or expired
    return NextResponse.json({ valid: false }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Failed to verify Figma token' }, { status: 502 });
  }
}
