---
title: Setup & Deployment
description: Register your target whiteboard, configure your source adapter (Figma and/or Penpot), deploy to Vercel, and set up optional extras.
---

# Setup & Deployment

SyncingBoard is split into **source adapters** (Figma, Penpot) and a **target adapter** (Miro). Most teams use either Figma or Penpot as their source, not both. This guide follows the same structure --- complete the common target setup, then skip to your chosen source section.

> [!IMPORTANT]
> **User-Owned OAuth Architecture:** SyncingBoard maintains zero user databases and requires no account registration. Every end-user authenticates directly with their own personal Figma and Miro accounts via OAuth 2.0. Access tokens are stored exclusively inside the client-side Miro board session.

---

## Common Target Setup (Required for Both Sources)

#### For Community Version (Hosted Demo)

If you are using the official Community hosted version (`syncingboard.com`), you can install the official Miro plugin directly to your Miro team with 1 click:

* **Official Miro App Install Link:** [Install SyncingBoard to Miro Team](https://miro.com/app-install/?response_type=code&client_id=3458764677695474299&redirect_uri=https%3A%2F%2Fwww.syncingboard.com%2Fapi%2Foauth%2Fmiro%2Fcallback)

#### For Self-Hosters (1-Click Vercel Deploy or Custom Registration)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fluismichio%2Fsyncingboard&env=FIGMA_CLIENT_ID,FIGMA_CLIENT_SECRET,MIRO_CLIENT_ID,MIRO_CLIENT_SECRET,ABLY_API_KEY,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN&project-name=syncingboard&repository-name=syncingboard)

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

### Register Figma Developer App

Only needed if you sync from **Figma**. Penpot-only users can skip to the Penpot section.

1. Go to the Figma Developer Portal: **[https://www.figma.com/developers/apps](https://www.figma.com/developers/apps)**.
2. Click **Create a new app**.
3. Choose a custom name for your app (e.g., `MySyncingBoard` or `Custom-Sync-Engine`).
   > To comply with branding guidelines, do not name public apps exactly `SyncingBoard`.
4. Set the Redirect URI to:
   ```
   https://YOUR_DOMAIN.com/api/oauth/figma/callback
   ```
5. Under **Scopes**, select **`file_content:read`**.
6. Copy the **Client ID and Secret**.

### Install Figma Companion Plugin (Optional — for Selection Auto-Detect)

To enable automatic canvas selection detection in the Miro sidebar without installing the SyncBridge desktop app, you can load the Figma Companion Plugin in your workspace:

#### For Community Version
1. Go to the Figma Community and search for **"SyncingBoard Companion"**.
2. Click **Save** or **Run** to add it to your Figma account (works in both Figma Browser and Desktop).
3. Copy the **Pairing ID** from your Miro sidebar, paste it into the companion input, and click **Connect**.
4. **File Pairing (First Time Only):** If prompted with *"Pair Figma Design File — This Figma file is not linked to Miro yet"*, paste the URL of your current Figma design file into the input and click **Link**. This permanently links the document metadata (`figma.root`) so you will never be asked again for that file.

#### For Self-Hosted Version
> [!NOTE]
> **Figma Desktop App Required:** Importing a local development plugin manifest is only supported in the Figma Desktop Application. The web browser version of Figma does not have access to the local filesystem and does not support local plugin imports.

1. Copy or clone the `figma-plugin/` directory from the root of this repository to your local computer.
2. Open the **Figma Desktop Application** and open any design file.
3. Click the Figma logo (menu button) in the top-left, then select **Plugins > Development > Import plugin from manifest...**.
4. Choose the `manifest.json` file inside the local `figma-plugin/` folder you copied.
5. Once imported, run the plugin: **Plugins > Development > SyncingBoard Companion**.
6. **Set the Host Domain (Self-Hosters):** The plugin loads the companion from the fixed production host (`https://www.syncingboard.com`) with no configuration required. If you self-host SyncingBoard, open `figma-plugin/ui.html` and change the `DEFAULT_HOST` constant to your deployed domain, then make sure that domain is also listed in `figma-plugin/manifest.json` under `networkAccess.allowedDomains` before importing the plugin.
7. Copy the **Pairing ID** from your Miro sidebar, paste it into the companion, and click **Connect**.
8. **File Pairing (First Time Only):** If prompted with *"Pair Figma Design File — This Figma file is not linked to Miro yet"*, paste the URL of your current Figma design file into the input and click **Link**. This permanently links the document metadata (`figma.root`) so you will never be asked again for that file.

---

## Source Adapter: Penpot (Skip if using Figma only)

### Install Penpot Companion Plugin

To use SyncingBoard with **Penpot**, install the Companion Plugin in your Penpot workspace:

#### For Community Version
1. In Penpot, open any design file.
2. In the right-hand panel, click the **Plugins** tab (puzzle icon).
3. Search for **"SyncingBoard Companion"** inside the Penpot Templates & Libraries, or click the `+` button and paste the official Community manifest URL:
   ```
   https://www.syncingboard.com/penpot-manifest.json
   ```
4. Click **Install**, open the companion sidebar, copy the **Pairing ID** from your Miro sidebar, and click **Connect**.

#### For Self-Hosted Version
1. In Penpot, open any design file.
2. In the right-hand panel, click the **Plugins** tab (puzzle icon).
3. Click the `+` button and paste your own custom hosted manifest URL:
   ```
   https://www.syncingboard.com/penpot-manifest.json
   ```
4. Click **Install**, open the companion sidebar, copy the **Pairing ID** from your Miro sidebar, and click **Connect**.

> **Note:** The Penpot Companion communicates over the cloud relay (public HTTPS). No local server or desktop app is required. Rendering happens locally in your browser tab; transport goes through SyncingBoard's relay.

#### Local Development Installation

1. Follow the steps above to add a new plugin.
2. For the Manifest URL, use your local address:
   ```
   http://localhost:3000/penpot-manifest.json
   ```

#### Troubleshooting: Companion Plugin Not Connecting

If the Penpot Companion plugin shows "offline" in the Miro plugin:

1. Make sure both the Miro plugin and the Penpot Companion use the **exact same Pairing ID**.
2. Check that your SyncingBoard deployment is reachable and `ABLY_API_KEY` is configured correctly.
3. Open the browser DevTools console in the Penpot tab --- look for Ably connection errors (CSP blocking the CDN script, or token timeout).

---

## Common Cloud Services: Upstash & Ably (Self-Hosters Only)

These cloud accounts are required to run the real-time relays and enforce persistent rate limits. Setup these accounts before deploying to Vercel:

### Upstash Redis (Penpot Sync & Persistent Rate Limiting)
* **Required** if you sync from **Penpot** (used to store and relay binary image buffers).
* **Required** for **both Figma & Penpot** self-hosters who want to enforce persistent rate limiting on serverless platforms (like Vercel).

**Setup Steps:**
1. Go to **[Upstash Console](https://console.upstash.com/)** and create a free account.
2. Click **Create Database**:
   - Select **Redis** as the database type.
   - Choose a name (e.g., `syncingboard-relay`).
   - Select the region closest to your Vercel deployment (e.g., `us-east-1` or `eu-west-1`).
   - **TLS** should be enabled by default (required).
3. After creation, copy the **REST URL** and **REST Token** --- you'll use them as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in the deploy step.
   > The free tier includes 10,000 commands per day --- only used during active imports and rate tracking.

### Ably Realtime (Penpot Sync & Figma Selection Relay)
* **Required** if you sync from **Penpot** (used to broadcast render command messages).
* **Required** if you want **Figma selection auto-detect** over the cloud relay (Figma Companion Plugin).

**Setup Steps:**
1. Go to **[Ably Console](https://ably.com/signup)** and create a free account.
2. In the dashboard, go to **API Keys** and click **Create new API key**.
3. Set the capability to:
   ```json
   {"penpot:*": ["publish", "presence", "subscribe"]}
   ```
4. Copy the key --- you'll use it as `ABLY_API_KEY` in the deploy step.
   > The free tier includes **6 million messages/month and 200 concurrent connections** --- more than enough for personal use. Companion subscriptions do not count toward the message limit.

---

## Deploy (Required)

### Deploy to Vercel (Recommended)

Vercel is the simplest deployment path --- one-click deploy with zero server management. However, other hosts work too (see [Alternatives](#~alternative-hosting) below).

1. Click the deploy button to clone and deploy instantly:
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fluismichio%2Fsyncingboard&env=FIGMA_CLIENT_ID,FIGMA_CLIENT_SECRET,MIRO_CLIENT_ID,MIRO_CLIENT_SECRET,NEXT_PUBLIC_APP_URL,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,ABLY_API_KEY)

2. Or import your fork manually from the Vercel Dashboard.

3. Configure environment variables. **Only set the ones relevant to your source:**

   | Variable | Needed For | Example |
   | :--- | :--- | :--- |
   | `NEXT_PUBLIC_APP_URL` | **Both** | `https://syncingboard.com` |
   | `MIRO_CLIENT_ID` | **Both** | From Miro Developer App |
   | `MIRO_CLIENT_SECRET` | **Both** | From Miro Developer App |
   | `FIGMA_CLIENT_ID` | **Figma only** | From Figma Developer App |
   | `FIGMA_CLIENT_SECRET` | **Figma only** | From Figma Developer App |
   | `UPSTASH_REDIS_REST_URL` | **Penpot only** | From Upstash Console (used for Penpot image relay) |
   | `UPSTASH_REDIS_REST_TOKEN` | **Penpot only** | From Upstash Console (used for Penpot image relay) |
   | `ABLY_API_KEY` | **Figma (selection relay) & Penpot** | From Ably Console (WebSocket broker) |

> **Session fairness (v0.15.1):** the relay enforces **1 active board per Miro user** — binding key `relay:user_board:{sha256(miro.currentUser.id)}` with a **30-minute TTL refreshed on every heartbeat**. Opening a second board shows a one-click **Transfer Session to This Board** banner. Guests with OAuth are first-class users; users without OAuth cannot sync and never hold a session.
>
   > Do NOT add a trailing slash to `NEXT_PUBLIC_APP_URL`. Example: `https://syncingboard.com` (no `/` at the end).
   >
   > For a complete reference of all environment variables, rate-limiting overrides, and `.env.example` templates, see [Environment Variables Reference](environment-variables.md).

4. Click **Deploy**.

### Alternative Hosting

Vercel is the default, but SyncingBoard is a standard Next.js app and runs on any host that supports Node.js serverless or containerized workloads. The main difference is the response body limit:

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

### Rate Limiting (Community Protection)

If you run a public instance, rate limiting protects your infrastructure from abuse. Three layers work together:

| Layer | What it tracks | Purpose |
|---|---|---|
| Edge middleware (60 req/min) | **Client IP address** | Blocks brute-force script spam before functions run |
| Per-endpoint limits (5-10 req/min) | **OAuth token hash** (IP fallback before auth) | Prevents user token abuse (immune to VPN cycling) |
| **Global daily backstop** (500 syncs/day) | **Shared Redis counter** | Protects total daily serverless budget |

Rate limiting tracks **ephemeral IP addresses** at the Edge Middleware level to stop script spam, and uses **SHA-256 OAuth token hashes** on authenticated endpoints so attackers cannot bypass user quotas by cycling VPN IPs. All rate counters expire automatically in Redis or memory after their window TTL.

Rate limiting is enabled by default when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured. On persistent infra (Docker/VPS) without Redis, an in-memory fallback is used instead. On Vercel without both Redis values, rate limiting logs a warning and disables gracefully (your Vercel function limits still apply).

**Configuration via env vars:**

| Variable | Default | What it limits |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `true` | Set to `false` to disable entirely |
| `RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN` | `5` | Figma render and node-info requests per minute per user token |
| `RATE_LIMIT_COMMUNITY_FIGMA_PER_DAY` | `50` | Figma renders per day per user token |
| `RATE_LIMIT_COMMUNITY_RELAY_PER_MIN` | `5` | Penpot relay requests per minute per pairing ID |
| `RATE_LIMIT_COMMUNITY_RELAY_PER_HOUR` | `30` | Penpot relay requests per hour per pairing ID |
| `RATE_LIMIT_COMMUNITY_RELAY_PER_DAY` | `100` | Penpot relay requests per day per pairing ID |
| `RATE_LIMIT_COMMUNITY_RELAY_SESSION_PER_MIN` | `4` | Miro relay session signals per minute per session ID |
| `RATE_LIMIT_COMMUNITY_MAX_RELAY_SESSIONS` | `40` | Concurrent relay-session lease ceiling across the deployment (target/source agnostic; legacy alias `RATE_LIMIT_COMMUNITY_MAX_MIRO_RELAY_SESSIONS`). Set `0` for unlimited |
| `RATE_LIMIT_COMMUNITY_MAX_COMPANION_TOKENS` | `180` | Concurrent companion Ably tokens across the deployment (v0.15.2 Design A fairness; Miro detectors keep a permanent 20-socket floor on top of this). Set `0` for unlimited |
| `RATE_LIMIT_COMMUNITY_UPDATE_IMAGE_PER_MIN` | `10` | Miro image updates per minute per user token |
| `RATE_LIMIT_COMMUNITY_ABLY_TOKEN_PER_MIN` | `5` | Ably token generation per minute per requester |
| `RATE_LIMIT_COMMUNITY_OAUTH_REFRESH_PER_MIN` | `3` | OAuth refresh exchanges per minute per refresh-token hash |
| `RATE_LIMIT_COMMUNITY_GLOBAL_SYNCS_PER_DAY` | `500` | Figma render and Miro image-update resource operations across all users per day |
| `RATE_LIMIT_COMMUNITY_OAUTH_CALLBACK_PER_MIN` | `20` | OAuth provider redirect callbacks per minute per client IP |
| `RATE_LIMIT_COMMUNITY_RELAY_EXPORT_PER_MIN` | `2` | Penpot/Figma relay exports per minute per pairing ID |
| `RATE_LIMIT_COMMUNITY_RELAY_EXPORT_PER_DAY` | `20` | Penpot/Figma relay exports per day per pairing ID |

When a limit is hit, the API returns `429` with a `Retry-After` header and JSON body:
```json
{
  "error": "rate_limit_exceeded",
  "limit": 5,
  "remaining": 0,
  "reset": 1721068800000,
  "plan": "community"
}
```

### Corporate AWS Scenario

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

## Security & Pairing Best Practices

**Your pairing ID (`sb_xxxx`) is a live access key.** Anyone who has it can detect, import, and sync from an open, connected Figma/Penpot companion — even from a different machine or Miro board. It is **read-only** (nobody can edit your design file through it), but it *is* a read window into whatever project is open in your companion.

### How access works
- **Figma:** imports and syncs always require your own Figma OAuth account, and Figma itself enforces per-file permissions server-side. The pairing ID is used only for live selection detection. If you cannot view a file in Figma, you cannot import it here.
- **Penpot:** the pairing ID is the only credential. Anyone holding it can export frames from whatever is currently open and connected in the Penpot companion.

### Best practices
- Treat the pairing ID like a password: never paste it into public chats, issues, screenshots, or repositories.
- The pairing key is displayed masked in the UI (copy-only, not editable) — copy it directly from the plugin.
- **Do not leave the companion connected on sensitive projects.** While the companion tab is open and connected, that pairing grants live read access to the open project.
- **Rotate on suspicion:** if a pairing ID may have leaked, re-pair with a fresh ID (generate a new one in the Miro plugin and re-enter it in the companion) and close the old companion connection. The old ID only works while a companion remains connected with it.
- Use a dedicated pairing ID per board/companion pair; do not reuse one pairing across untrusted parties.
- Disconnect the companion plugin when you are done (closing it releases the live connection).

**Planned:** an optional passphrase (PIN) to protect sensitive pairings is planned for a future release.

---

## Local Development

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

3. **Expose Localhost via HTTPS Tunnel (Required for Miro Integration Testing):**
   To test the SyncingBoard plugin inside a Miro whiteboard (`https://miro.com`), you must expose your local dev server (`http://localhost:3000`) over an HTTPS tunnel. You can use **cloudflared, ngrok, localtunnel**, or any tunnel provider of your choice:

   ```bash
   # Option A: Using cloudflared (Free, no account required)
   npx @cloudflare/cloudflared tunnel --url http://localhost:3000

   # Option B: Using ngrok
   # ngrok http 3000

   # Option C: Using localtunnel
   # npx localtunnel --port 3000
   ```

   > **Why is an HTTPS tunnel required?** Miro (`https://miro.com`) blocks unencrypted `http://localhost` plugin iframes due to browser mixed-content security rules, and Miro's developer portal strictly rejects plain `http://localhost` in App URL / Redirect URI fields.
   >
   > **Updating Miro Developer App for Local Testing:** When testing locally, set your private Miro App URL in your Miro Developer Portal to your HTTPS tunnel address:
   > - **App URL:** `https://YOUR_TUNNEL_URL/miro-plugin?init=true`
   > - **Redirect URI:** `https://YOUR_TUNNEL_URL/api/oauth/miro/callback`

4. **Start the development server:**
   ```bash
   yarn dev
   ```

5. **Testing Companion Plugins Locally (Figma & Penpot):**

   * **Figma Companion (Local Manifest Import):**
     1. Open the **Figma Desktop Application** (local manifest import requires the desktop app).
     2. Open any design file ➔ Click Figma menu ➔ **Plugins > Development > Import plugin from manifest...**
     3. Select `figma-plugin/manifest.json` from your local workspace folder.
     4. Run the plugin (**Plugins > Development > SyncingBoard Companion**). Point it at your local tunnel by editing the `DEFAULT_HOST` constant in `figma-plugin/ui.html` (e.g. `https://YOUR_TUNNEL_URL`) and adding that origin to `devAllowedDomains` in `figma-plugin/manifest.json` before importing.
     5. Copy the **Pairing ID** from your local Miro sidebar, paste it into the companion, and click **Connect**.

   * **Penpot Companion (Local Manifest Import):**
     1. Open any design file in Penpot (`penpot.app` or self-hosted Penpot).
     2. In the right panel, click the **Plugins** tab ➔ Click `+` (Add Custom Plugin).
     3. Paste your local manifest URL: `http://localhost:3000/penpot-manifest.json` (or `https://YOUR_TUNNEL_URL/penpot-manifest.json`).
     4. Install, open the companion sidebar, copy the **Pairing ID** from your local Miro sidebar, and click **Connect**.

6. **Testing Figma Developer App (OAuth) Locally:**
   * In your **Figma Developer Portal** (`https://www.figma.com/developers/apps`), set the Redirect URI to your HTTPS tunnel:
     ```
     https://YOUR_TUNNEL_URL/api/oauth/figma/callback
     ```
   * Set `NEXT_PUBLIC_APP_URL=https://YOUR_TUNNEL_URL` in your local `.env.local`. When a user clicks **Connect Figma** in the Miro sidebar, Figma will redirect back to your local callback handler seamlessly.

### Verification & Testing

Verify your setup and custom edits before deploying:

```bash
yarn test     # Run 76+ automated Vitest unit & route integration tests
yarn lint     # Verify ESLint code standards and TypeScript types
yarn build    # Validate production build compilation
```

---

## Tauri Desktop App (SyncBridge) (Optional)

> [!NOTE]
> **Planned / Experimental Feature:** The Tauri desktop app (SyncBridge) is **optional and currently in design / planned development (not fully implemented in the v0.13.4 release)**. It is intended for future capabilities such as large image streaming (>4.5MB), Adobe UXP integration, local LLMs, and two-way sync. Day-to-day cloud-native Figma and Penpot sync works 100% out of the box without installing SyncBridge.

### Prerequisites and Build

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

### Local SSL Certificate (mkcert)

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
  local-syncingboard.luiskobayashi.com \
  127.0.0.1 \
  localhost
```

**Windows (PowerShell):**
```powershell
cd tauri-bridge\src-tauri\resources
mkcert -cert-file cert.pem -key-file key.pem local-syncingboard.luiskobayashi.com 127.0.0.1 localhost
```

**Step 4 --- Rebuild:**
```bash
cd tauri-bridge
yarn tauri build    # production
# or
yarn tauri dev      # development
```

> Do not commit `cert.pem` or `key.pem` --- they are already in `.gitignore`.

### DNS Loopback Record

SyncingBoard uses a public DNS A record pointing to `127.0.0.1` so that `local-syncingboard.luiskobayashi.com` resolves to your local machine with valid TLS.

- **Domain:** `local-syncingboard.luiskobayashi.com`
- **Type:** `A`
- **Value:** `127.0.0.1`

If you fork this project with your own domain:
1. Add an A record (`local-syncingboard` -> `127.0.0.1`) with your DNS provider.
   > Squarespace DNS does not accept dots in the Host field. Use a dash (`-`) as a separator.
2. Update all occurrences of `local-syncingboard.luiskobayashi.com` in:
   - `public/penpot-companion-ui.html`
   - `src/app/miro-plugin/companionRelayClient.ts`
   - `tauri-bridge/index.html`
   - `tauri-bridge/src-tauri/src/lib.rs` (comment only)
3. Regenerate your `cert.pem` / `key.pem` for the new domain.

**Troubleshooting --- DNS Rebinding Protection:**

Some routers block public domains from resolving to loopback addresses. Add a manual override to your `hosts` file:

```
127.0.0.1 local-syncingboard.luiskobayashi.com
```

- **Windows:** `C:\Windows\System32\drivers\etc\hosts` (run Notepad as Administrator)
- **macOS / Linux:** `sudo sh -c 'echo "127.0.0.1 local-syncingboard.luiskobayashi.com" >> /etc/hosts'`

Then flush DNS:
- **Windows:** `ipconfig /flushdns`
- **macOS:** `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
- **Chrome/Edge:** `chrome://net-internals/#dns` -> **Clear host cache**

### Automated GitHub Releases

SyncingBoard includes a GitHub Actions pipeline that compiles installer packages automatically:

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

---

## Customization & White-Labeling (Optional)

If you are self-hosting SyncingBoard and want to integrate it as part of your company's internal design tool suite, you can customize the naming, logos, and accent colors to match your brand guidelines.

### Renaming & Configuring the Plugins
* **Figma Companion:** 
  * Edit the `"name"` property inside `figma-plugin/manifest.json`.
  * **Domain Access Configuration:** If you are self-hosting on a custom domain (e.g. `https://syncingboard.com`), you must append your custom domain to the `"allowedDomains"` array inside `figma-plugin/manifest.json`. Figma blocks all network requests to domains not whitelisted in this file.
* **Penpot Companion:** Edit the `"name"` and `"description"` properties inside `public/penpot-manifest.json`.
* **Miro Sidebar:** Edit the app name in your private Miro developer portal console settings.

### Customizing Logo Icons
* **Penpot Companion:** Replace `public/syncingboard_logo.svg` with your custom company icon (maintaining the same filename so the manifest automatically references it).
* **Figma Companion:** When publishing the plugin to your private Figma Organization directory, upload your custom square icon asset (SVG or PNG) in the Figma Publisher console page.
* **Miro Sidebar:** Upload your custom app icon asset in your private Miro developer app settings page.

### Adjusting Theme Colors
SyncingBoard uses standard CSS variable tokens to define themes. You can change these colors to match your design system's branding:
* **Miro Sidebar UI:** Update the `--accent` (brand cyan) and color tokens inside `src/app/globals.css`.
* **Figma Companion UI:** Update the root variable tokens inside `public/figma-companion-ui.html`.
* **Penpot Companion UI:** Update the root variable tokens inside `public/penpot-companion-ui.html`.
