import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';

const PROVIDER_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

type Platform = 'figma' | 'miro';

function parsePlatform(raw: unknown): Platform | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.platform === 'figma') return 'figma';
  if (obj.platform === 'miro') return 'miro';
  return null;
}

async function handler(request: Request) {
  try {
    // Read refreshToken from header (backlog #6: header-based token transmission)
    const refreshToken = request.headers.get('X-Refresh-Token') || '';
    // Read platform from body (not a secret)
    const body = await request.json().catch(() => ({}));
    const platform = parsePlatform(body);

    if (!refreshToken || !platform) {
      return NextResponse.json(
        { error: 'Missing or invalid refreshToken (X-Refresh-Token header) or platform (body)' },
        { status: 400 }
      );
    }

    if (platform === 'figma') {
      const figmaClientId = process.env.FIGMA_CLIENT_ID;
      const figmaClientSecret = process.env.FIGMA_CLIENT_SECRET;

      if (!figmaClientId || !figmaClientSecret) {
        return NextResponse.json(
          { error: 'Figma credentials are not configured on the server.' },
          { status: 500 }
        );
      }

      const response = await fetchWithTimeout('https://api.figma.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: figmaClientId,
          client_secret: figmaClientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      }, PROVIDER_TIMEOUT_MS);

      const data: unknown = await response.json();
      const obj = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};

      if (!response.ok) {
        const message = typeof obj.message === 'string' ? obj.message : 'Figma token refresh failed';
        return NextResponse.json({ error: message }, { status: response.status });
      }

      const accessToken = typeof obj.access_token === 'string' ? obj.access_token : null;
      const returnedRefreshToken = typeof obj.refresh_token === 'string' ? obj.refresh_token : refreshToken;
      const expiresIn = typeof obj.expires_in === 'number' ? obj.expires_in : 3600;

      if (!accessToken) {
        return NextResponse.json(
          { error: 'Figma token refresh response is missing access_token' },
          { status: 502 }
        );
      }

      const expiresAt = Date.now() + expiresIn * 1000;
      return NextResponse.json({
        accessToken,
        refreshToken: returnedRefreshToken,
        expiresAt,
      });
    }

    const miroClientId = process.env.MIRO_CLIENT_ID;
    const miroClientSecret = process.env.MIRO_CLIENT_SECRET;

    if (!miroClientId || !miroClientSecret) {
      return NextResponse.json(
        { error: 'Miro credentials are not configured on the server.' },
        { status: 500 }
      );
    }

    const response = await fetchWithTimeout('https://api.miro.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: miroClientId,
        client_secret: miroClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    }, PROVIDER_TIMEOUT_MS);

    const data: unknown = await response.json();
    const obj = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};

    if (!response.ok) {
      const message = typeof obj.message === 'string' ? obj.message : 'Miro token refresh failed';
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const accessToken = typeof obj.access_token === 'string' ? obj.access_token : null;
    const returnedRefreshToken = typeof obj.refresh_token === 'string' ? obj.refresh_token : refreshToken;
    const expiresIn = typeof obj.expires_in === 'number' ? obj.expires_in : 3600;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Miro token refresh response is missing access_token' },
        { status: 502 }
      );
    }

    const expiresAt = Date.now() + expiresIn * 1000;
    return NextResponse.json({
      accessToken,
      refreshToken: returnedRefreshToken,
      expiresAt,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'OAuth provider refresh timed out' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error during token refresh' },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit({ endpoint: 'oauth:refresh' })(handler);
