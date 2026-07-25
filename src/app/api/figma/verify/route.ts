import { NextResponse } from 'next/server';

/**
 * Lightweight Figma token verification endpoint.
 * Calls Figma's /v1/me endpoint to check if the provided token is still valid.
 * Used by the Miro plugin to detect stale/revoked tokens without requiring
 * a file-specific API call.
 *
 * Status code contract:
 *   200 — token is valid
 *   401 — Figma explicitly rejected the token (revoked/expired)
 *   502 — transient error (timeout, Figma 5xx, network); caller should NOT clear the token
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  let response: Response;
  try {
    response = await fetch('https://api.figma.com/v1/me', {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Network error or timeout — transient, don't tell caller to clear
    return NextResponse.json({ error: 'Failed to verify Figma token' }, { status: 502 });
  }

  if (response.ok) {
    return NextResponse.json({ valid: true });
  }

  // Only a definitive 401/403 from Figma means the token is truly invalid.
  // 5xx errors from Figma are transient and should NOT clear the token.
  if (response.status === 401 || response.status === 403) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  // Figma 5xx or unexpected — transient, don't clear
  return NextResponse.json({ error: 'Figma API error' }, { status: 502 });
}
