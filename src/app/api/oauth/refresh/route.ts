import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { platform, refreshToken } = await request.json();

    if (!platform || !refreshToken) {
      return NextResponse.json(
        { error: 'Missing platform or refreshToken in request body' },
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

      const response = await fetch('https://api.figma.com/v1/oauth/token', {
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
      });

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          { error: data.message || 'Figma token refresh failed' },
          { status: response.status }
        );
      }

      const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      return NextResponse.json({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // fallback to old refresh token if new one isn't sent
        expiresAt,
      });
    }

    if (platform === 'miro') {
      const miroClientId = process.env.MIRO_CLIENT_ID;
      const miroClientSecret = process.env.MIRO_CLIENT_SECRET;

      if (!miroClientId || !miroClientSecret) {
        return NextResponse.json(
          { error: 'Miro credentials are not configured on the server.' },
          { status: 500 }
        );
      }

      const response = await fetch('https://api.miro.com/v1/oauth/token', {
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
      });

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          { error: data.message || 'Miro token refresh failed' },
          { status: response.status }
        );
      }

      const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      return NextResponse.json({
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt,
      });
    }

    return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
