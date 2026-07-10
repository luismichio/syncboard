import { NextRequest, NextResponse } from 'next/server';

const HTML_HEAD = `
<head>
  <title>Figma Connection</title>
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
        root.style.setProperty('--bg-card', '#121212');
        root.style.setProperty('--border-card', '#1F1F1F');
        root.style.setProperty('--text-muted', '#9A9997');
        root.style.setProperty('--accent', '#01C8F1');
        root.style.setProperty('--text-error', '#FFA27D');
      } else {
        root.style.setProperty('--bg-page', '#FAF9F5');
        root.style.setProperty('--text-page', '#0A0A0A');
        root.style.setProperty('--bg-card', '#F2EFE9');
        root.style.setProperty('--border-card', '#E0DBD0');
        root.style.setProperty('--text-muted', '#5E5E5E');
        root.style.setProperty('--accent', '#00A2C9');
        root.style.setProperty('--text-error', '#D32F2F');
      }
    })();
  </script>
  <style>
    body {
      font-family: sans-serif;
      background: var(--bg-page);
      color: var(--text-page);
      text-align: center;
      padding: 40px;
      margin: 0;
      transition: background-color 0.2s, color 0.2s;
    }
    .container {
      max-width: 500px;
      margin: 0 auto;
    }
    h2, h3 { margin-top: 0; font-weight: 600; }
    p { color: var(--text-muted); font-size: 14px; line-height: 1.5; }
    .error-msg { color: var(--text-error); font-weight: 500; }
    button {
      padding: 8px 16px;
      cursor: pointer;
      border-radius: 6px;
      border: 1px solid var(--border-card);
      background: var(--bg-card);
      color: var(--text-page);
      font-size: 14px;
      transition: background-color 0.2s, border-color 0.2s;
    }
    button:hover { background: var(--border-card); }
    .spinner {
      display: inline-block;
      width: 28px;
      height: 28px;
      border: 3px solid var(--border-card);
      border-radius: 50%;
      border-top-color: var(--accent);
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const stateParam = searchParams.get('state');
  const stateCookie = request.cookies.get('figma_oauth_state')?.value;

  const figmaClientId = process.env.FIGMA_CLIENT_ID;
  const figmaClientSecret = process.env.FIGMA_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/oauth/figma/callback`;

  // 1. Verify CSRF State
  if (!stateCookie || !stateParam || stateCookie !== stateParam) {
    const csrfResponse = new NextResponse(
      `<!DOCTYPE html>
<html>
${HTML_HEAD}
<body>
  <div class="container">
    <h3>Authentication Failed</h3>
    <p class="error-msg">Security validation failed (invalid or missing state parameter). Please try again.</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
    csrfResponse.cookies.delete('figma_oauth_state');
    return csrfResponse;
  }

  if (error || !code) {
    const errorResponse = new NextResponse(
      `<!DOCTYPE html>
<html>
${HTML_HEAD}
<body>
  <div class="container">
    <h3>Authentication Failed</h3>
    <p class="error-msg">${error || 'No authorization code returned.'}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
    errorResponse.cookies.delete('figma_oauth_state');
    return errorResponse;
  }

  if (!figmaClientId || !figmaClientSecret) {
    const configResponse = new NextResponse(
      `<!DOCTYPE html>
<html>
${HTML_HEAD}
<body>
  <div class="container">
    <h2>Configuration Error</h2>
    <p class="error-msg">Please ensure both <strong>FIGMA_CLIENT_ID</strong> and <strong>FIGMA_CLIENT_SECRET</strong> are configured on the server.</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
    configResponse.cookies.delete('figma_oauth_state');
    return configResponse;
  }

  try {
    // Exchange the code for an access token
    const tokenResponse = await fetch('https://api.figma.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: figmaClientId,
        client_secret: figmaClientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const data = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(data.message || data.error_description || 'Token exchange failed');
    }

    const { access_token, refresh_token, expires_in } = data;
    const expiresAt = Date.now() + (expires_in || 3600) * 1000;

    // Securely serialize the token structure to avoid string escaping injection vulnerabilities
    const tokenPayload = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt,
    };

    // Return the HTML payload that passes tokens to the browser client securely and statelessly
    const htmlResponse = `
<!DOCTYPE html>
<html>
${HTML_HEAD}
<body>
  <div class="container">
    <h3>Figma Connected!</h3>
    <div class="spinner"></div>
    <script>
      const tokens = ${JSON.stringify(tokenPayload)};
      // Save locally in client storage
      try {
        localStorage.setItem('figma_tokens', JSON.stringify(tokens));
      } catch (e) {
        console.error("Local storage write failed:", e);
      }
      // Broadcast to same-origin pages (dashboard / plugin iframe)
      try {
        const channel = new BroadcastChannel('oauth_callback');
        channel.postMessage({ type: 'FIGMA_AUTH_SUCCESS', tokens });
        channel.close();
      } catch (e) {
        console.error("Broadcast failed:", e);
      }
      // Send message to opener window (popups)
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'FIGMA_AUTH_SUCCESS', tokens }, window.location.origin);
        }
      } catch (e) {
        console.error("PostMessage failed:", e);
      }
      // Close the popup window
      setTimeout(() => {
        window.close();
      }, 1000);
    </script>
  </div>
</body>
</html>
`;

    const response = new NextResponse(htmlResponse, {
      headers: { 'Content-Type': 'text/html' },
    });
    response.cookies.delete('figma_oauth_state');
    return response;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errResponse = new NextResponse(
      `<!DOCTYPE html>
<html>
${HTML_HEAD}
<body>
  <div class="container">
    <h3>Error during Token Exchange</h3>
    <p class="error-msg">${errorMsg}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }
    );
    errResponse.cookies.delete('figma_oauth_state');
    return errResponse;
  }
}
