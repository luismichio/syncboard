---
title: Setup & Deployment
description: Register OAuth apps, configure environment variables, deploy to Vercel, and set up the Penpot Companion plugin.
---

# 🚀 Setup & Deployment

This guide covers everything needed to get SyncBoard running — from registering OAuth apps to deploying on Vercel and configuring the Penpot Companion plugin.

---

## 1. Register Figma Developer App

1. Go to the Figma Developer Portal: **[https://www.figma.com/developers/apps](https://www.figma.com/developers/apps)**.
2. Click **Create a new app**.
3. Choose a custom name for your app (e.g., `MySyncBoard` or `Custom-Sync-Engine`).
   > To comply with branding guidelines, do not name public apps exactly `SyncBoard`.
4. Set the Redirect URI to:
   ```
   https://YOUR_DOMAIN.com/api/oauth/figma/callback
   ```
5. Under **Scopes**, select **`file_content:read`**.
6. Copy the **Client ID and Secret**.

---

## 2. Register Miro Developer App

1. Go to your **Miro Profile Settings** → **Developer Team** → **Create new app**. Give it a custom name.
2. Set the App URL to:
   ```
   https://YOUR_DOMAIN.com/miro-plugin?init=true
   ```
3. Under **OAuth 2.0 Settings**:
   - Set Redirect URI to: `https://YOUR_DOMAIN.com/api/oauth/miro/callback`
   - Enable the checkbox: **"Use this URI for SDK Authorization"**
4. Enable the following scopes:
   - `boards:read`
   - `boards:write`
5. Click **Create App** and copy your **Client ID** and **Client Secret**.

---

## 3. Set Up Cloud Services (for Penpot Relay)

SyncBoard uses two cloud services for the Penpot relay:

### Ably (command delivery via WebSocket)

1. Go to **[Ably Console](https://ably.com/signup)** and create a free account.
2. In the dashboard, go to **API Keys** and click **Create new API key**.
3. Set the capability to:
   ```json
   {"penpot:*": ["publish", "presence", "subscribe"]}
   ```
4. Copy the key — you'll use it as `ABLY_API_KEY` in the next step.

> The free tier includes **200,000 messages/month** — more than enough for personal use. Companion subscriptions do not count toward the message limit.

### Upstash Redis (result storage)

1. Go to **[Upstash Console](https://console.upstash.com/)** and create a free account.
2. Click **Create Database**:
   - Select **Redis** as the database type.
   - Choose a name (e.g., `syncboard-relay`).
   - Select the region closest to your Vercel deployment (e.g., `us-east-1` or `eu-west-1`).
   - **TLS** should be enabled by default (required).
3. After creation, copy the **REST URL** and **REST Token**.

> The free tier includes 10,000 commands per day — only used during active imports, not idle polling.

---

## 4. Deploy to Vercel

1. Click the deploy button to clone and deploy instantly:

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fluismichio%2Fsyncboard&env=FIGMA_CLIENT_ID,FIGMA_CLIENT_SECRET,MIRO_CLIENT_ID,MIRO_CLIENT_SECRET,NEXT_PUBLIC_APP_URL,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,ABLY_API_KEY)

2. Or import your fork manually from the Vercel Dashboard.
3. Configure these environment variables:

   | Variable | Required | Example | Notes |
   | :--- | :--- | :--- | :--- |
   | `NEXT_PUBLIC_APP_URL` | ✅ | `https://syncboard.yourdomain.com` | Do **NOT** add a trailing slash. |
   | `FIGMA_CLIENT_ID` | ✅ | From Figma Developer App | |
   | `FIGMA_CLIENT_SECRET` | ✅ | From Figma Developer App | |
   | `MIRO_CLIENT_ID` | ✅ | From Miro Developer App | |
   | `MIRO_CLIENT_SECRET` | ✅ | From Miro Developer App | |
   | `UPSTASH_REDIS_REST_URL` | ✅ | From Upstash | Required for Penpot relay |
   | `UPSTASH_REDIS_REST_TOKEN` | ✅ | From Upstash | |
   | `ABLY_API_KEY` | ✅ | From Ably Console | |

4. Click **Deploy**.

---

## 5. Penpot Companion Plugin Setup

To use SyncBoard with **Penpot**, install the Companion Plugin in your Penpot workspace:

### Production Installation

1. In Penpot, open any design file.
2. In the right-hand panel, click the **Plugins** tab (puzzle icon).
3. Locate the plugin insertion section at the bottom of the tab.
4. Paste the secure manifest URL:
   ```
   https://syncboard.luiskobayashi.com/penpot-manifest.json
   ```
5. Click **Install**. The plugin will appear in your workspace list.
6. Click the plugin to open it, copy the **Pairing ID** from the Miro plugin settings, and paste it into the Penpot Companion to connect.

> **Note:** The Penpot Companion communicates over the cloud relay (public HTTPS). No local server or desktop app is required. Rendering happens locally in your browser tab; transport goes through SyncBoard's relay.

### Local Development Installation

1. Follow the steps above to add a new plugin.
2. For the Manifest URL, use your local address:
   ```
   http://localhost:3000/penpot-manifest.json
   ```

### Troubleshooting: Companion Plugin Not Connecting

If the Penpot Companion plugin shows "offline" in the Miro plugin:

1. Make sure both the Miro plugin and the Penpot Companion use the **exact same Pairing ID**.
2. Check that your SyncBoard deployment is reachable and `ABLY_API_KEY` is configured correctly.
3. Open the browser DevTools console in the Penpot tab — look for Ably connection errors (CSP blocking the CDN script, or token timeout).

---

## 6. Chrome SSL Trust (for SyncBridge)

If you use the **SyncBridge** desktop app (Tauri), Chrome requires trusting its self-signed certificate:

1. Open your browser and navigate to `https://local-syncboard.luiskobayashi.com:4401`.
2. Click **Advanced** → **Proceed to local-syncboard.luiskobayashi.com (unsafe)**.
3. The connection warning will not appear again for that domain.
4. **Restart Miro Desktop** (Electron apps need a full restart to reload their SSL trust store).

---

## 7. Local Development

For testing and coding on your local machine:

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Configure local environment variables (`.env.local`):**
   ```env
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   FIGMA_CLIENT_ID=your_local_id
   FIGMA_CLIENT_SECRET=your_local_secret
   MIRO_CLIENT_ID=your_local_id
   MIRO_CLIENT_SECRET=your_local_secret
   UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your_upstash_token
   ABLY_API_KEY=your_ably_key
   ```

3. **Expose localhost using `cloudflared`:**
   ```bash
   npx @cloudflare/cloudflared tunnel --url http://localhost:3000
   ```
   > This creates a public HTTPS URL for OAuth callbacks during local development.

4. **Start the development server:**
   ```bash
   yarn dev
   ```
