import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const figmaClientId = process.env.FIGMA_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/oauth/figma/callback`;

  if (!figmaClientId) {
    return new NextResponse(
      `<html>
        <head><title>Setup Required</title></head>
        <body style="font-family: sans-serif; padding: 40px; background: #0A0A0A; color: #FAF9F5;">
          <h2>FIGMA_CLIENT_ID is missing</h2>
          <p>Please make sure you set the <strong>FIGMA_CLIENT_ID</strong> environment variable in your deployment.</p>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }

  // Generate a random state parameter to prevent CSRF attacks
  const state = Math.random().toString(36).substring(7);

  // We request 'file_content:read' scope to fetch the file structure and render screenshots
  const authUrl = `https://www.figma.com/oauth?client_id=${figmaClientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=file_content:read&state=${state}&response_type=code`;

  return NextResponse.redirect(authUrl);
}
