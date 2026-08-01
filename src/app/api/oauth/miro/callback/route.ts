import { NextRequest, NextResponse } from 'next/server';

const HTML_HEAD = `
<head>
  <title>Miro Connection</title>
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
    
  </style>
</head>
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const stateParam = searchParams.get('state');
  const stateCookie = request.cookies.get('miro_oauth_state')?.value;

  const miroClientId = process.env.MIRO_CLIENT_ID;
  const miroClientSecret = process.env.MIRO_CLIENT_SECRET;
  let host = request.headers.get('host') || 'localhost:3000';
  if (host === 'syncingboard.com') host = 'www.syncingboard.com';
  const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const appUrl = `${protocol}://${host}`;
  const redirectUri = `${appUrl}/api/oauth/miro/callback`;

  // 1. Verify CSRF State or Direct Miro App Installation Callback
  // Direct installation callbacks from Miro's app-install URL return an authorization
  // code with no state parameter and no prior cookie. We detect this by checking that
  // both the cookie and the state param are absent/empty — no env-var override needed.
  const isDirectInstall = !stateCookie && (!stateParam || stateParam.trim() === '');

  if (!isDirectInstall && stateCookie !== stateParam) {
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
    csrfResponse.cookies.delete('miro_oauth_state');
    return csrfResponse;
  }

  if (error || !code) {
    const safeError = escapeHtml(error || 'No authorization code returned.');
    const errorResponse = new NextResponse(
      `<!DOCTYPE html>
<html>
${HTML_HEAD}
<body>
  <div class="container">
    <h3>Authentication Failed</h3>
    <p class="error-msg">${safeError}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`,
      {
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
          'X-Content-Type-Options': 'nosniff',
        },
        status: 400,
      }
    );
    errorResponse.cookies.delete('miro_oauth_state');
    return errorResponse;
  }

  if (!miroClientId || !miroClientSecret) {
    const configResponse = new NextResponse(
      `<!DOCTYPE html>
<html>
${HTML_HEAD}
<body>
  <div class="container">
    <h2>Configuration Error</h2>
    <p class="error-msg">Please ensure both <strong>MIRO_CLIENT_ID</strong> and <strong>MIRO_CLIENT_SECRET</strong> are configured on the server.</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
    configResponse.cookies.delete('miro_oauth_state');
    return configResponse;
  }

  try {
    // Exchange the code for an access token using Miro's v1 token API
    const tokenResponse = await fetch('https://api.miro.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: miroClientId,
        client_secret: miroClientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const data = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(data.message || data.error_description || 'Miro token exchange failed');
    }

    const { access_token, refresh_token, expires_in, team_id } = data;
    const expiresAt = Date.now() + (expires_in || 3600) * 1000;

    // Securely serialize the token structure to avoid string escaping injection vulnerabilities
    const tokenPayload = {
      accessToken: typeof access_token === 'string' ? access_token : '',
      refreshToken: typeof refresh_token === 'string' ? refresh_token : '',
      expiresAt,
      teamId: typeof team_id === 'string' ? team_id : '',
    };

    // Return the HTML payload that passes tokens to the browser client securely and statelessly
    const htmlResponse = `
<!DOCTYPE html>
<html>
${HTML_HEAD}
<body>
  <div class="container">
    <h3>Miro Connected!</h3>
    <div class="success-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#01C8F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="16 8 10 16 7 13" />
      </svg>
    </div>
    <p>You can safely close this tab.</p>
    <script>
      const tokens = ${JSON.stringify(tokenPayload)};
      const state = ${JSON.stringify(stateParam)};
      // Save locally in client storage
      try {
        const fp = (() => { try { const o = window.location.origin; let h = 0; for (let i = 0; i < o.length; i++) { h = ((h << 5) - h) + o.charCodeAt(i); h |= 0; } return '_' + Math.abs(h).toString(36); } catch { return ''; } })(); localStorage.setItem('miro_tokens' + fp, JSON.stringify(tokens));
      } catch (e) {
        console.error("Local storage write failed:", e);
      }
      // Broadcast to same-origin pages (dashboard / plugin iframe)
      try {
        const channel = new BroadcastChannel('oauth_callback');
        channel.postMessage({ type: 'MIRO_AUTH_SUCCESS', tokens });
        channel.close();
      } catch (e) {
        console.error("Broadcast failed:", e);
      }
      // Send message to opener window (popups)
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'MIRO_AUTH_SUCCESS', tokens }, window.location.origin);
        }
      } catch (e) {
        console.error("PostMessage failed:", e);
      }
      // POST to stateless backend cache to allow polling inside Desktop App process
      fetch('/api/oauth/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, tokens })
      })
      .catch(err => console.error("Stateless store failed:", err))
      .finally(() => {
        setTimeout(() => {
          window.close();
        }, 1200);
      });
    </script>
  </div>
</body>
</html>
`;

    const response = new NextResponse(htmlResponse, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
        'X-Content-Type-Options': 'nosniff',
      },
    });
    response.cookies.delete('miro_oauth_state');
    return response;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const safeError = escapeHtml(errorMsg);
    const errResponse = new NextResponse(
      `<!DOCTYPE html>
<html>
${HTML_HEAD}
<body>
  <div class="container">
    <h3>Error during Token Exchange</h3>
    <p class="error-msg">${safeError}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }
    );
    errResponse.cookies.delete('miro_oauth_state');
    return errResponse;
  }
}
