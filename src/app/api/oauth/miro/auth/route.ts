import { NextResponse } from 'next/server';

export async function GET() {
  const miroClientId = process.env.MIRO_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/oauth/miro/callback`;

  if (!miroClientId) {
    return new NextResponse(
      `<html>
        <head><title>Setup Required</title></head>
        <body style="font-family: sans-serif; padding: 40px; background: #0A0A0A; color: #FAF9F5;">
          <h2>MIRO_CLIENT_ID is missing</h2>
          <p>Please make sure you set the <strong>MIRO_CLIENT_ID</strong> environment variable in your deployment.</p>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }

  const state = Math.random().toString(36).substring(7);

  // We redirect to Miro to grant permission to modify boards
  const authUrl = `https://miro.com/oauth/authorize?response_type=code&client_id=${miroClientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}`;

  return NextResponse.redirect(authUrl);
}
