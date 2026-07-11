import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const miroClientId = process.env.MIRO_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/oauth/miro/callback`;

  if (!miroClientId) {
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
  <h2>MIRO_CLIENT_ID is missing</h2>
  <p>Please make sure you set the <strong>MIRO_CLIENT_ID</strong> environment variable in your deployment.</p>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }

  // Read state parameter from client query, or fallback to generating a random one
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state') || crypto.randomBytes(16).toString('hex');

  // We redirect to Miro to grant permission to modify boards
  const authUrl = `https://miro.com/oauth/authorize?response_type=code&client_id=${miroClientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('miro_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
    path: '/',
  });

  return response;
}
