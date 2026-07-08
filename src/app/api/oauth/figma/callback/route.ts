import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const figmaClientId = process.env.FIGMA_CLIENT_ID;
  const figmaClientSecret = process.env.FIGMA_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/oauth/figma/callback`;

  if (error || !code) {
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 20px; background: #0A0A0A; color: #FAF9F5; text-align: center;">
          <h3>Authentication Failed</h3>
          <p>${error || 'No authorization code returned.'}</p>
          <button onclick="window.close()" style="padding: 8px 16px; cursor: pointer; border-radius: 4px; border: 1px solid #5E5E5E; background: #1A1A1A; color: white;">Close Window</button>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  if (!figmaClientId || !figmaClientSecret) {
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 20px; background: #0A0A0A; color: #FAF9F5;">
          <h2>Configuration Error</h2>
          <p>Please ensure both <strong>FIGMA_CLIENT_ID</strong> and <strong>FIGMA_CLIENT_SECRET</strong> are configured on the server.</p>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
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

    // Return the HTML payload that passes tokens to the browser client securely and statelessly
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Figma Authentication Successful</title>
        <style>
          body { font-family: sans-serif; background: #0A0A0A; color: #FAF9F5; text-align: center; padding: 40px; }
          .spinner { border: 4px solid rgba(255,255,255,0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #01C8F1; animation: spin 1s linear infinite; margin: 20px auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <h3>Figma Connected!</h3>
        <p>Connecting accounts and sync tunnels...</p>
        <div class="spinner"></div>
        <script>
          const tokens = {
            accessToken: "${access_token}",
            refreshToken: "${refresh_token}",
            expiresAt: ${expiresAt}
          };

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
      </body>
      </html>
    `;

    return new NextResponse(htmlResponse, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err: any) {
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 20px; background: #0A0A0A; color: #FAF9F5; text-align: center;">
          <h3>Error during Token Exchange</h3>
          <p style="color: #FFA27D;">${err.message || err}</p>
          <button onclick="window.close()" style="padding: 8px 16px; cursor: pointer; border-radius: 4px; border: 1px solid #5E5E5E; background: #1A1A1A; color: white;">Close Window</button>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    );
  }
}
