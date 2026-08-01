import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const figmaClientId = process.env.FIGMA_CLIENT_ID;
  let host = request.headers.get('host') || 'localhost:3000';
  if (host === 'syncingboard.com') host = 'www.syncingboard.com';
  const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const appUrl = `${protocol}://${host}`;
  const redirectUri = `${appUrl}/api/oauth/figma/callback`;

  if (!figmaClientId) {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>Setup Required</title>
  <script>
    (function() {
      const savedTheme = localStorage.getItem('theme');
      let isDark = true;
      if (savedTheme === 'light') isDark = false;
      else if (savedTheme === 'dark') isDark = true;
      else isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const root = document.documentElement;
      if (isDark) {
        root.style.setProperty('--bg-page', '#0A0A0A');
        root.style.setProperty('--text-page', '#FAF9F5');
        root.style.setProperty('--text-muted', '#9A9997');
      } else {
        root.style.setProperty('--bg-page', '#FAF9F5');
        root.style.setProperty('--text-page', '#0A0A0A');
        root.style.setProperty('--text-muted', '#5E5E5E');
      }
    })();
  </script>
  <style>
    body {
      font-family: sans-serif;
      background: var(--bg-page);
      color: var(--text-page);
      padding: 40px;
      margin: 0;
    }
    h2 { margin-top: 0; }
    p { color: var(--text-muted); line-height: 1.5; }
  </style>
</head>
<body>
  <h2>FIGMA_CLIENT_ID is missing</h2>
  <p>Please make sure you set the <strong>FIGMA_CLIENT_ID</strong> environment variable in your deployment.</p>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }

  // Read state parameter from client query, or fallback to generating a random one
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state') || crypto.randomBytes(16).toString('hex');

  // We request 'file_content:read' scope to fetch the file structure and render screenshots.
  const authUrl = `https://www.figma.com/oauth?client_id=${figmaClientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=file_content:read&state=${state}&response_type=code`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('figma_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
    path: '/',
  });

  return response;
}
