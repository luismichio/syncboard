---
title: Setup & Deployment
description: Register your target whiteboard, configure your source adapter (Figma and/or Penpot), deploy to Vercel, and set up optional extras.
---

# Setup & Deployment

SyncBoard is split into **source adapters** (Figma, Penpot) and a **target adapter** (Miro). Most teams use either Figma or Penpot as their source, not both. This guide follows the same structure --- complete the common target setup, then skip to your chosen source section.

---

## Common Target Setup (Required for Both Sources)

### 1. Register Miro Developer App

Miro is the whiteboard target. Both Figma and Penpot sync go through Miro.

1. Go to your **Miro Profile Settings** -> **Developer Team** -> **Create new app**. Give it a custom name.
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

## Source Adapter: Figma (Skip if using Penpot only)

### 2. Register Figma Developer App

Only needed if you sync from **Figma**. Penpot-only users can skip to the Penpot section.

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

## Source Adapter: Penpot (Skip if using Figma only)

### 3. Set Up Cloud Services (for Penpot Relay)

Only needed if you sync from **Penpot**. Unlike Figma (cloud-native API), Penpot requires a relay because it has no cloud rendering API. Two lightweight services coordinate between the Miro plugin and the Penpot Companion plugin:

#### Ably (command delivery via WebSocket)

1. Go to **[Ably Console](https://ably.com/signup)** and create a free account.
2. In the dashboard, go to **API Keys** and click **Create new API key**.
3. Set the capability to:
   ```json
   {"penpot:*": ["publish", "presence", "subscribe"]}
   ```
4. Copy the key --- you'll use it as `ABLY_API_KEY` in the deploy step.
   > The free tier includes **200,000 messages/month** --- more than enough for personal use. Companion subscriptions do not count toward the message limit.

#### Upstash Redis (result storage)

1. Go to **[Upstash Console](https://console.upstash.com/)** and create a free account.
2. Click **Create Database**:
   - Select **Redis** as the database type.
   - Choose a name (e.g., `syncboard-relay`).
   - Select the region closest to your Vercel deployment (e.g., `us-east-1` or `eu-west-1`).
   - **TLS** should be enabled by default (required).
3. After creation, copy the **REST URL** and **REST Token**.
   > The free tier includes 10,000 commands per day --- only used during active imports, not idle polling.

### 4. Install Penpot Companion Plugin

To use SyncBoard with **Penpot**, install the Companion Plugin in your Penpot workspace:

#### Production Installation

1. In Penpot, open any design file.
2. In the right-hand panel, click the **Plugins** tab (puzzle icon).
3. Locate the plugin insertion section at the bottom of the tab.
4. Paste the secure manifest URL (replace with your own domain if self-hosting):
   ```
   https://YOUR_DOMAIN.com/penpot-manifest.json
   ```
5. Click **Install**. The plugin will appear in your workspace list.
6. Click the plugin to open it, copy the **Pairing ID** from the Miro plugin settings, and paste it into the Penpot Companion to connect.

> **Note:** The Penpot Companion communicates over the cloud relay (public HTTPS). No local server or desktop app is required. Rendering happens locally in your browser tab; transport goes through SyncBoard's relay.

#### Local Development Installation

1. Follow the steps above to add a new plugin.
2. For the Manifest URL, use your local address:
   ```
   http://localhost:3000/penpot-manifest.json
   ```

#### Troubleshooting: Companion Plugin Not Connecting

If the Penpot Companion plugin shows "offline" in the Miro plugin:

1. Make sure both the Miro plugin and the Penpot Companion use the **exact same Pairing ID**.
2. Check that your SyncBoard deployment is reachable and `ABLY_API_KEY` is configured correctly.
3. Open the browser DevTools console in the Penpot tab --- look for Ably connection errors (CSP blocking the CDN script, or token timeout).

---

## Deploy (Required)

### 5. Deploy to Vercel (Recommended)

Vercel is the simplest deployment path --- one-click deploy with zero server management. However, other hosts work too (see [Alternatives](#~alternative-hosting) below).

1. Click the deploy button to clone and deploy instantly:
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fluismichio%2Fsyncboard&env=FIGMA_CLIENT_ID,FIGMA_CLIENT_SECRET,MIRO_CLIENT_ID,MIRO_CLIENT_SECRET,NEXT_PUBLIC_APP_URL,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,ABLY_API_KEY)

2. Or import your fork manually from the Vercel Dashboard.

3. Configure environment variables. **Only set the ones relevant to your source:**

   | Variable | Needed For | Example |
   | :--- | :--- | :--- |
   | `NEXT_PUBLIC_APP_URL` | **Both** | `https://syncboard.yourdomain.com` |
   | `MIRO_CLIENT_ID` | **Both** | From Miro Developer App |
   | `MIRO_CLIENT_SECRET` | **Both** | From Miro Developer App |
   | `FIGMA_CLIENT_ID` | **Figma only** | From Figma Developer App |
   | `FIGMA_CLIENT_SECRET` | **Figma only** | From Figma Developer App |
   | `UPSTASH_REDIS_REST_URL` | **Penpot only** | From Upstash Console |
   | `UPSTASH_REDIS_REST_TOKEN` | **Penpot only** | From Upstash Console |
   | `ABLY_API_KEY` | **Penpot only** | From Ably Console |

   > Do NOT add a trailing slash to `NEXT_PUBLIC_APP_URL`. Example: `https://syncboard.yourdomain.com` (no `/` at the end).

4. Click **Deploy**.

### ~ Alternative Hosting

Vercel is the default, but SyncBoard is a standard Next.js app and runs on any host that supports Node.js serverless or containerized workloads. The main difference is the response body limit:

| Host | Response Body Limit | Image Payload Limit | Notes |
| :--- | :--- | :--- | :--- |
| **Vercel** (Hobby/Pro) | **4.5 MB** | Images above 4.5MB need Tauri extender | One-click deploy, zero config |
| **Netlify** | **50 MB** | Most large images work without Tauri | 10s function timeout on free tier |
| **Railway** | None documented | Large images work natively | 500MB RAM, 60s timeout |
| **Render** | None documented | Large images work natively | 100-512MB RAM depending on plan |
| **Google Cloud Run** | **32 MB** | Large images up to 32MB work natively | 60s timeout, auto-scaling |
| **AWS ECS/Fargate** | None (full container) | Unlimited | Run behind ALB + CloudFront for HTTPS |
| **AWS Elastic Beanstalk** | None (full VM) | Unlimited | Managed Node.js platform |
| **Azure Container Apps** | None | Unlimited | 30s request timeout by default (configurable) |
| **Fly.io** | None (full VM) | Unlimited | Persistent storage, any runtime |
| **Docker / VPS** | None | Unlimited | Full control, you manage infra |

To deploy on an alternative host:
1. Set the same environment variables listed above.
2. Use `yarn build && yarn start` for a Node server (Next.js standalone mode), or adapt for your platform's builder.
3. Make sure the public URL matches your `NEXT_PUBLIC_APP_URL` and your Miro/Figma OAuth redirect URIs.

The **4.5MB limit is Vercel-specific** --- if you use any other host, large images sync without needing the Tauri desktop app for size reasons. (Tauri is still needed for Adobe UXP, local LLMs, and two-way sync.)

### ~ Corporate AWS Scenario

If your company runs on AWS, here is the typical deployment pattern:

1. **Build the Docker image:**
   ```dockerfile
   FROM node:22-alpine
   WORKDIR /app
   COPY package.json yarn.lock ./
   RUN yarn install --frozen-lockfile
   COPY . .
   RUN yarn build
   EXPOSE 3000
   CMD ["yarn", "start"]
   ```
   > Next.js `standalone` output mode is not configured by default. Add `output: "standalone"` to `next.config.ts` for smaller Docker images that only include the production server.

2. **Push to ECR and deploy on ECS Fargate:**
   - Service behind an **Application Load Balancer (ALB)** with HTTPS (ACM certificate for your domain).
   - Set health check to `GET /` or `GET /api/health`.
   - Minimum 1 task, 512MB RAM / 0.25 vCPU (enough for Next.js).

3. **Set environment variables** in the ECS task definition (same vars as the Vercel table above).

4. **Point your domain** at the ALB DNS name via Route 53 (or your DNS provider). Update the Miro and Figma OAuth redirect URIs to your domain.

5. **Optional --- CloudFront CDN:** Add a CloudFront distribution in front of the ALB for caching static assets (CSS, JS, docs pages). The API routes (`/api/*`) should bypass the cache or use origin-forwarding.

**Result:** Unlimited image payload sizes, no serverless function limits, full control over scaling. The only costs are ECS Fargate (~$10-30/mo for a single small task) + ALB (~$20/mo) + optional CloudFront. No per-request fees.

> **Why still use Upstash/Ably?** The Penpot relay still needs Redis for result storage and Ably for WebSocket delivery --- these are transport-layer services, not hosting. They stay regardless of where you host the Next.js app itself.

---

## 6. Local Development

---

## 6. Local Development

For testing and coding on your local machine (commands work on Windows, macOS, and Linux):

1. **Install dependencies:**
   ```
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
   ```
   npx @cloudflare/cloudflared tunnel --url http://localhost:3000
   ```
   > This creates a public HTTPS URL for OAuth callbacks during local development.

4. **Start the development server:**
   ```
   yarn dev
   ```

---

## 7. Tauri Desktop App (SyncBridge) (Optional)

> **Note:** The Tauri app is **optional** --- only needed for large images (>4.5MB), Adobe UXP integration, local LLMs, and two-way sync. Day-to-day sync with Figma and Penpot works without it.

### 7.1 Prerequisites and Build

1. **Install Prerequisites:**
   - **Node.js & Yarn** (already installed)
   - **Rust toolchain:** Install via **[rustup.rs](https://rustup.rs/)**
   - **OS Toolkits:**
     - **Windows:** C++ build tools (via Visual Studio Installer)
     - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
     - **Linux:**
       ```bash
       sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev
       ```

2. **Build and Run:**
   ```bash
   cd tauri-bridge
   yarn install
   yarn tauri dev
   ```

### 7.2 Local SSL Certificate (mkcert)

Miro runs on `https://miro.com`. The **SyncBridge desktop app** (Tauri/Electron) serves an HTTPS endpoint on localhost that requires a trusted certificate. SyncBridge uses `mkcert` --- a zero-config tool that creates certificates trusted by your system.

> **Chrome web vs Electron:** These certificates are needed for **Miro Desktop (Electron)**, which can connect to localhost. Chrome web has stricter **Private Network Access (PNA)** rules that block browser->localhost connections from public origins regardless of SSL --- this is why the cloud-relay architecture is the default for Penpot. SyncBridge is only needed for capability extension (large images, Adobe UXP, local LLMs), not for day-to-day sync.

> **Important:** The `cert.pem` and `key.pem` files are machine-specific and excluded from git via `.gitignore`. Every developer generates their own.

**Step 1 --- Install `mkcert`:**
- **Windows:** `winget install FiloSottile.mkcert`
- **macOS:** `brew install mkcert`
- **Linux:**
  ```bash
  sudo apt install libnss3-tools
  wget -O mkcert https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-amd64
  chmod +x mkcert
  sudo mv mkcert /usr/local/bin/
  ```

**Step 2 --- Install the Local CA (one-time per machine):**
```bash
mkcert -install
```

**Step 3 --- Generate the Certificate:**
```bash
cd tauri-bridge/src-tauri/resources
mkcert \
  -cert-file cert.pem \
  -key-file key.pem \
  local-syncboard.luiskobayashi.com \
  127.0.0.1 \
  localhost
```

**Windows (PowerShell):**
```powershell
cd tauri-bridge\src-tauri\resources
mkcert -cert-file cert.pem -key-file key.pem local-syncboard.luiskobayashi.com 127.0.0.1 localhost
```

**Step 4 --- Rebuild:**
```bash
cd tauri-bridge
yarn tauri build    # production
# or
yarn tauri dev      # development
```

> Do not commit `cert.pem` or `key.pem` --- they are already in `.gitignore`.

### 7.3 DNS Loopback Record

SyncBoard uses a public DNS A record pointing to `127.0.0.1` so that `local-syncboard.luiskobayashi.com` resolves to your local machine with valid TLS.

- **Domain:** `local-syncboard.luiskobayashi.com`
- **Type:** `A`
- **Value:** `127.0.0.1`

If you fork this project with your own domain:
1. Add an A record (`local-syncboard` -> `127.0.0.1`) with your DNS provider.
   > Squarespace DNS does not accept dots in the Host field. Use a dash (`-`) as a separator.
2. Update all occurrences of `local-syncboard.luiskobayashi.com` in:
   - `public/penpot-companion-ui.html`
   - `src/app/miro-plugin/penpotMcpClient.ts`
   - `tauri-bridge/index.html`
   - `tauri-bridge/src-tauri/src/lib.rs` (comment only)
3. Regenerate your `cert.pem` / `key.pem` for the new domain.

**Troubleshooting --- DNS Rebinding Protection:**

Some routers block public domains from resolving to loopback addresses. Add a manual override to your `hosts` file:

```
127.0.0.1 local-syncboard.luiskobayashi.com
```

- **Windows:** `C:\Windows\System32\drivers\etc\hosts` (run Notepad as Administrator)
- **macOS / Linux:** `sudo sh -c 'echo "127.0.0.1 local-syncboard.luiskobayashi.com" >> /etc/hosts'`

Then flush DNS:
- **Windows:** `ipconfig /flushdns`
- **macOS:** `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
- **Chrome/Edge:** `chrome://net-internals/#dns` -> **Clear host cache**

### 7.4 Automated GitHub Releases

SyncBoard includes a GitHub Actions pipeline that compiles installer packages automatically:

**To trigger a release:**
1. Increment the version in `tauri-bridge/src-tauri/tauri.conf.json` and `tauri-bridge/package.json`.
2. Commit and push.
3. Tag the commit:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. GitHub Actions builds:
   - **Windows:** `.msi` and `.exe` installers
   - **macOS:** `.dmg` and `.app` bundles
   - **Linux:** `.deb` and `.AppImage` packages
5. Assets are uploaded to a new **Draft Release** --- verify and publish.

> For CI/CD releases, `cert.pem` and `key.pem` must be stored as **GitHub Actions Secrets** and written during the build step. See `.github/workflows/` for the existing pipeline.
