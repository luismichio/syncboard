# 📐 SyncBoard Architecture & System Design

SyncBoard is a stateless design-to-canvas sync engine designed to fetch, render, and update screenshots in-place on Miro boards. It supports both **Figma** and **Penpot** design pipelines.

---

## 🧭 1. Dual-Platform Rendering Strategy

SyncBoard utilizes two distinct sync strategies based on the capabilities of the source platforms. Both routes converge through the same Next.js API surface; only the render source differs:

```
                  ┌────────────────────────────────────────┐
                  │        Miro Plugin (any browser)       │
                  └──────┬──────────────────────────┬──────┘
                         │                          │
           Figma Sync    │                          │ Penpot Sync
         (Cloud-Native)  │                          │   (Cloud Relay)
                         ▼                          ▼
  ┌───────────────────────────────┐        ┌───────────────────────────────────┐
  │     SyncBoard Cloud API       │        │    SyncBoard Cloud Relay          │
  │     (Next.js on Vercel)       │        │    (Upstash Redis + Vercel)       │
  └──────────────┬────────────────┘        └──────────────┬────────────────────┘
                 │                                        │
                 ▼ Cloud REST Fetch                       ▼ HTTPS Poll/Result
  ┌───────────────────────────────┐        ┌───────────────────────────────────┐
  │      Figma Cloud Servers      │        │    Penpot Companion Plugin        │
  │     (api.figma.com/v1)        │        │    (in design.penpot.app tab)     │
  └───────────────────────────────┘        └───────────────────────────────────┘

> **Note:** The optional Tauri desktop app (not shown) extends capabilities for large images, Adobe UXP, local LLMs, and two-way sync — but is not required for the core sync pipeline.
```

### A. Figma Sync (Cloud-Native)
Figma provides a robust, public web API that renders design frames to images in the cloud.
* **Flow:** The Miro plugin makes a request to the SyncBoard Next.js API. The server requests the frame render directly from Figma's cloud servers (`api.figma.com/v1/images`), downloads the image, and uploads it to the Miro widget.
* **Benefits:** Zero user configuration, no local servers, and no tunnels required.

### B. Penpot Sync (Cloud Relay & Browser Plugin Render)
Unlike Figma, Penpot does **not** provide a public REST API that can render design frames into PNG/SVG in the cloud. Syncing Penpot designs uses a cloud relay to coordinate a local browser plugin:
* **The Cloud Limitation:** To render Penpot designs in the cloud, a server must boot a headless browser instance (Puppeteer/Playwright), load the Penpot editor client, authenticate the user, load the heavy WebAssembly editor assets, and take screenshots. This would require hosting expensive rendering nodes.
* **The Relay Solution:** SyncBoard uses the designer's **active Penpot browser tab** as the renderer, coordinated via an Upstash Redis relay. The Penpot Companion plugin polls `/api/relay/penpot/poll` for pending commands, executes them using Penpot's native plugin APIs (`penpot.export`), and posts results back to `/api/relay/penpot/result`. The Miro plugin sends requests through `/api/relay/request` and waits for the response synchronously.
* **Flow:** All communication travels over public HTTPS — no localhost calls required. The Penpot Companion plugin stays connected via a presence heartbeat, and the relay handles timeouts, retries, and pairing.
* **Benefits:** Bypasses Chrome PNA blocks entirely, works in any modern browser, and requires no local server or desktop app. 100% free of cloud rendering costs.

---

## 📡 2. Selection Detection Strategy

Selection detection sources vary by platform and evolve toward a uniform relay pattern:

| Platform | Current Method | Future Direction |
| :--- | :--- | :--- |
| **Penpot** | Companion plugin polls relay for commands | Stable — relay-first |
| **Figma** | (Planned) Figma plugin → relay | Figma plugin + relay (mirror Penpot pattern) |
| **Adobe** | (Planned) UXP plugin → Tauri local socket | Tauri capability extender |

### Current Implementation
- **Penpot:** The Penpot Companion plugin (`penpot-companion-ui.html`) connects via the relay, polls for `select` or `export` commands, executes them using Penpot's native plugin API, and returns results through the relay.
- **Figma (SyncBridge fallback):** When Tauri is installed, it can query the Figma Desktop MCP port (`127.0.0.1:3845/mcp`) locally via native HTTP on the Rust side — this is the only remaining Tauri dependency and will be replaced by the Figma plugin + relay.

### Why Not Tauri for Transport?
Chrome PNA blocks all browser → localhost calls from public origins. Even with valid SSL and correct CORS+PNA headers, both `fetch()` and `WebSocket` are denied. Tauri remains valuable as a **capability extender** (see §7), not as a transport bridge.

---

## 🗃️ 3. Stateless Metadata Registry

SyncBoard stores all design connection metadata directly in the Miro widget. No databases are required to track which widget maps to which design frame.

* **Figma Image Title Signature:** `Node Name [SyncBoard|fileKey|nodeId]`
* **Penpot Image Title Signature:** `Node Name [PenpotSync|fileKey|nodeId]`
* **Metadata Payload:** Inside the Miro image widget's metadata (`image.getMetadata().syncboard`):
  ```json
  {
    "fileKey": "UUID_or_FileKey",
    "nodeId": "Frame_Node_ID",
    "nodeName": "Home Screen",
    "format": "png" | "svg",
    "scale": 1 | 2 | 3 | 4,
    "platform": "figma" | "penpot"
  }
  ```

---

## ⚡ 4. Duplicate Card Consolidation

To prevent clutter in the Miro plugin sidebar, SyncBoard groups identical selected canvas widgets (same `fileKey` + `nodeId` signature) into a single card:
* Shows a count badge (e.g. `x3`) in the top-right corner.
* Modifying settings (like resolution scale or format) on the grouped card instantly updates all matching widgets on the canvas.
* Users can toggle **"Also update all board copies"** to automatically apply updates to every copy of that frame on the board in a single click.

---

## ⚠️ 5. Rate Limits & Quotas

SyncBoard includes built-in throttles to comply with Figma and Miro API rate limit restrictions:

### A. Figma API Quotas
Figma limits the `GET /v1/images` endpoint based on user plan tiers:
* **Starter (Free) Plan:** Limited to **6 image requests per month** per account. Once reached, Figma blocks requests for up to 4.5 days.
* **Paid Plans (Professional/Enterprise):** 10 to 20 requests per minute.
* **SyncBoard Optimization:** SyncBoard batches all requested frames from the same file into a single HTTP request to minimize quota consumption.

### B. Penpot API Quotas
Unlike Figma, Penpot does not enforce API rate limits or monthly quotas for exports. Rendering happens locally in the Penpot browser tab; only the command coordination and result transport pass through cloud infrastructure.
* **No Cloud Rendering Costs:** The actual SVG/PNG rendering runs on the user's GPU/CPU inside the Penpot browser tab — no cloud rendering servers needed. Image data does flow through Vercel and Redis ephemerally during transport (see §8.B), but this is lightweight passthrough, not cloud compute.
* **No API Quotas:** Penpot does not rate-limit plugin API calls. You can sync unlimited frames with no pricing tiers or usage caps.
* **Relay overhead per sync:** Each Penpot export generates ~10–20 Redis commands (poll loop + result store) and 2 Vercel function invocations (relay request + Miro update). See §8.C for size constraints.

### C. Miro API Quotas
Miro limits heavyset widget operations (like uploading and PATCHing images) to **50 requests per minute** per user token.
* **SyncBoard Optimization:** Includes a **500ms delay** between consecutive widget updates to prevent hitting Miro's limit.

---

## 🧠 6. Chromium Loopback & Sandboxing Security (Learnings & Constraints)

During development and security auditing, we uncovered several strict browser-level constraints regarding secure loopback requests from inside Miro's iframe environments. These are documented below to guide future architectural decisions:

### A. Chromium Local Network Access (LNA) Iframe Restriction
Modern Chromium browsers completely block public websites inside cross-origin `iframe` containers from making requests to the local network or loopback (`127.0.0.1`/`localhost`), regardless of CORS or SSL certificate validity.
* **The Constraint:** Unless the parent page (`miro.com`) explicitly sets `allow="loopback-network"` on the iframe element, the browser blocks all loopback fetch and WebSocket connections.
* **The Solution:** The Miro Desktop App (built on Electron) is not subject to this strict sandboxing rule, allowing the Miro plugin to query the local `https://local-syncboard.luiskobayashi.com:4401` companion server directly.

### B. Strict CORS Private Network Access (PNA) Preflights
When LNA is bypassed (e.g., inside Electron/Miro Desktop), Chromium requires a secure context (HTTPS) and enforces a strict preflight check (`OPTIONS` request) for local connections.
* **The Constraint:** The server **must not** return a wildcard `*` for `Access-Control-Allow-Origin` during PNA preflights; it must echo back the exact requesting origin (e.g. `https://syncboard.luiskobayashi.com`).
* **The Solution:** The Axum backend uses `tower_http`'s `AllowOrigin::mirror_request()` to dynamically reflect the request origin header and explicitly returns `Access-Control-Allow-Private-Network: true`.

### C. Chromium `targetAddressSpace` Fetch Parameter
To prevent silent network scanning, Chromium requires active labeling of fetches targeting loopback devices.
* **The Solution:** All frontend loopback queries to port 4401 are configured with the non-standard `targetAddressSpace: 'loopback'` fetch option (cast as `RequestInit` to satisfy TypeScript linting rules).

### D. Electron Isolated SSL Trust Store
While standard browsers trust custom root certificates (like the `mkcert` CA) immediately after system registry installation (`mkcert -install`), Electron clients do not always dynamically sync or reload newly registered system CAs.
* **The Constraint:** If the certificates are modified or newly generated, the parent application (Miro Desktop) must be fully restarted to refresh the Electron SSL trust engine.

### E. Redirection Isolation (Desktop OAuth Polling)
Opening Miro or Figma authentication pages in Miro Desktop opens the system browser. Once auth completes in the system browser, the OAuth callback cannot redirect back to the Miro Desktop context due to process isolation (the desktop app cannot access Chrome cookies/localstorage).
* **The Solution:** We implemented a **stateless OAuth state polling mechanism**:
  1. The Miro plugin generates a unique random `state` and registers it before opening the browser.
  2. The system browser callbacks POST the tokens to `/api/oauth/store` mapped by the `state`.
  3. The Miro plugin polls `/api/oauth/store` for the tokens and completes the login inside the desktop app.

---

## 🏗️ 7. Architecture Evolution: Cloud-Relay-First with Tauri as Capability Extender

As of **v0.5.1**, the architecture shifted based on real-world PNA findings and the adoption of cloud relay for Penpot transport.

### Discovery: PNA Blocks All Browser → Localhost Transport

Chrome's Private Network Access (PNA) blocks both `fetch()` and `WebSocket` from public origins (Miro plugin sandbox, Penpot web app) to loopback/localhost, regardless of CORS headers or valid SSL. This made Tauri's original role as a local transport bridge unviable from browser contexts.

### Decision: Cloud-Relay-First Architecture

| Layer | Before (Tauri Transport) | After (Cloud Relay) |
| :--- | :--- | :--- |
| Penpot transport | Tauri WebSocket ↔ localhost | Upstash Redis relay ↔ public HTTPS |
| Figma selection | Tauri MCP ↔ Figma Desktop port | (Future) Figma plugin → relay |
| Penpot selection | Tauri WebSocket → Companion plugin | Companion plugin → relay |
| Selection source | Tauri acts as producer/consumer | Plugin acts as producer, relay as transport |

### Tauri's New Role: Capability Extender

Tauri is no longer required for day-to-day sync. It becomes an **optional desktop companion** for operations that exceed what a pure web plugin can do:

```
┌──────────────────────────────────────────────┐
│            SyncBoard Ecosystem                │
│                                              │
│  ┌──────────────────┐ ┌──────────────────┐   │
│  │   Cloud Tier      │ │  Tauri Extender   │   │
│  │  (Always Avail.)  │ │  (Optional)       │   │
│  │                   │ │                   │   │
│  │ • Figma API sync  │ │ • Large images    │   │
│  │ • Penpot relay    │ │   (>4.5MB)        │   │
│  │ • OAuth polling   │ │ • Adobe UXP       │   │
│  │ • Doc site        │ │ • Local LLMs      │   │
│  │ • Rate limiting   │ │ • Image compress  │   │
│  │ • Miro API        │ │ • Office/PDF      │   │
│  │                   │ │ • Two-way sync    │   │
│  └──────────────────┘ └──────────────────┘   │
└──────────────────────────────────────────────┘
```

#### What Tauri Enables (Web-Native Cannot)

1. **Large Binary Transport** — Vercel body limit is 4.5MB. Tauri can chunk and stream multi-megabyte images.
2. **Native Socket/IPC** — Talk to desktop apps (Adobe UXP plugin, Obsidian local API, local MCP servers).
3. **File System Access** — Read/write local PDFs, Markdown vaults, Office documents.
4. **Local Compute** — Run local LLMs (Ollama), Squoosh/WASM compression, format conversion.
5. **Background Sync** — Long-running two-way watchers between Miro and other tools/databases.
6. **System Integration** — Notifications, clipboard, tray, auto-update.

### Future: Multi-Whiteboard Platform

The relay-first architecture decouples the sync engine from any single canvas provider. The same plugin + relay pattern extends to:

- **Miro** (current)
- **Mural**
- **FigJam**
- **Microsoft Whiteboard**
- **Excalidraw** (self-hosted)
- **tldraw** (embedded)

Each whiteboard gets a thin plugin that reads/updates widgets and talks to SyncBoard's cloud API. The Tauri extender can optionally enhance any of these with the capabilities above.

---

## 💰 8. Data Transport & Infrastructure Costs

Understanding where image bytes travel is critical for self-hosters evaluating hosting costs and limits. This section traces the data path for each sync pipeline and explains the cost implications.

### A. Figma Sync Path (Cloud-Native)

```
Miro Plugin ──POST──► SyncBoard API ──GET──► Figma API
    (request)       (Next.js on Vercel)   (api.figma.com/v1/images)
                        │
                        ▼  image/png bytes
                   SyncBoard API
                        │
                        ▼  PATCH multipart
                   Miro API
                   (api.miro.com/v2/boards/.../images/...)
```

**Where bytes travel:**
1. Figma API → Vercel (image download, full binary)
2. Vercel → Miro API (image upload, full binary as multipart form)

**Image bytes pass through Vercel twice** — download from Figma, then upload to Miro. This counts against Vercel's function execution time (max 60s on Pro) and outbound bandwidth.

### B. Penpot Relay Path (Cloud-Relay)

```
Miro Plugin ──POST──► /api/relay/request ──LPUSH──► Redis
    (request)       (Vercel enqueues        (command queue)
                     command, waits)
                        │
                        │  ◄──── RPoll ── Penpot Companion Plugin
                        │         polls /api/relay/penpot/poll
                        │         renders shape locally
                        │         POSTs result to /api/relay/penpot/result
                        ▼
                   Redis SETEX ──► /api/relay/request
                   (result stored   (response returned to Miro plugin)
                    for 45s)
                        │
                        ▼  SVG text or base64 PNG as JSON
                   Miro Plugin
                        │
                        ▼  POST with dataUrl
                   /api/miro/update-image
                   (Vercel decodes base64, PATCHes to Miro API)
                        │
                        ▼  multipart PATCH
                   Miro API
```

**Where bytes travel:**
1. Penpot plugin → Redis (SVG string or base64 PNG, stored as JSON value, 45s TTL)
2. Redis → Vercel `/api/relay/request` response (image data returned to Miro plugin)
3. Miro plugin → Vercel `/api/miro/update-image` (image data sent as `dataUrl`)
4. Vercel → Miro API (image upload after base64 decode)

Image bytes pass through **Redis ephemerally** (step 1–2) and **Vercel twice** (step 2 response, step 3–4 upload).

### C. Size Constraints & Where They Apply

| Constraint | Limit | Affected Path | Mitigation |
| :--- | :--- | :--- | :--- |
| Vercel serverless body size | **4.5 MB** (Hobby & Pro) | All paths — request body sent to Vercel | Tauri direct upload (future); compress images before sync |
| Vercel serverless response size | **4.5 MB** (Hobby & Pro) | `/api/relay/request` returning image data | Tauri direct upload (future); use SVG when possible (more compact) |
| Vercel execution timeout | **10s** (Hobby), **60s** (Pro), **900s** (Enterprise) | `/api/miro/update-image` — large images take time to download/upload | Keep images under 1MB for Hobby plan; upgrade to Pro for larger |
| Vercel outbound bandwidth | **100 GB/mo** (Hobby), **1 TB/mo** (Pro) | Figma path downloads image; all paths upload to Miro | SVG format uses ~10× less bandwidth than PNG; Tauri direct upload bypasses Vercel entirely |
| Vercel function invocations | **100k/mo** (Hobby), **10M/mo** (Pro) | Each sync operation = 1 relay request + 1 update-image call | Batch exports reduce calls; see §4 |
| Redis value size | **~512 MB** (Upstash max) | Relay result payload returned to Miro plugin | Practical limit is Vercel's 4.5 MB response size, not Redis |
| Redis commands/mo | **10k/day** (Upstash Free), **100k/day** (Pay-as-you-go ~$0.15/1k) | Each poll, register, and result = 1 command | Each sync run = ~10–20 Redis commands (register, poll loop, result, delete) |
| Redis storage | **50 MB** (Upstash Free), **1 GB** ($0.15/GB) | Ephemeral command queue + result cache (45s TTL) | Negligible — data auto-expires; no persistent growth |

### D. Cost Estimates for Self-Hosters

| Scenario | Vercel Plan | Upstash Plan | Monthly Cost | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Personal use, light sync | Hobby (free) | Free (10k cmd/day) | **$0** | Stay under 4.5MB per image, under 100k invocations |
| Team, regular Figma sync | Pro ($20/mo) | Free (10k cmd/day) | **$20/mo** | 1TB bandwidth, 60s timeout handles larger images |
| Heavy Penpot sync, large SVGs | Pro ($20/mo) | Pay-as-you-go (~$1–3/mo) | **$21–23/mo** | ~5–20k Redis commands/day for active usage |
| Large images needing >4.5MB | Pro + Tauri extender | Free ($0) | **$20/mo** | Tauri handles direct Miro upload, bypassing Vercel body limit |

### E. Why This Architecture Is Cost-Efficient

1. **No persistent servers** — Vercel is serverless (pay-per-call), Upstash is serverless Redis (pay-per-command). No EC2, no VPS.
2. **No cloud rendering** — Unlike a Puppeteer-based solution that would need a persistent GPU instance (~$50–200/mo), rendering happens in the user's browser tab at zero cloud cost.
3. **No image storage** — Images flow through Vercel/Redis ephemerally and land in Miro. No S3, no CDN, no persistent blob storage.
4. **SVG-first for vector designs** — SVGs are typically 10–50 KB vs 200–500 KB for PNG equivalents, drastically reducing bandwidth and storage costs.

### F. When Tauri Reduces Infrastructure Costs

| Scenario | Without Tauri | With Tauri | Savings |
| :--- | :--- | :--- | :--- |
| 5 MB PNG export | Fails (Vercel 4.5MB limit) | Uploads directly to Miro API | Unblocks feature |
| 100 daily syncs × 500 KB PNG | ~50 GB Vercel bandwidth/mo | ~0 GB bandwidth (Tauri→Miro direct) | Stays within Hobby plan |
| Batch 50 images | 50 Vercel invocations | 0 invocations (Tauri batches locally) | Saves function quota |

In short: the cloud relay path handles **small-to-medium payloads** efficiently at near-zero cost. Tauri is only needed when you hit the 4.5MB ceiling or want to eliminate Vercel bandwidth entirely.

### G. When Tauri IS Used for Transport (Legacy Mode)

If the user explicitly enables SyncBridge in settings (`syncboard\_use\_tauri = true`), Tauri acts as a local loopback bridge for **selection detection only** — it does **not** replace the image upload path through Vercel. This mode is a legacy fallback for Miro Desktop (Electron) users who already have Tauri installed.

```
Miro Plugin ──POST──► Tauri Bridge ──WS──► Penpot Companion Plugin
    (request)       (localhost:4401)    (renders shape locally)
                         │
                         │  ◄── SVG/base64 ──┘
                         ▼
                   Miro Plugin  ──POST──► /api/miro/update-image ──► Miro API
                   (data URL)          (Vercel, still subject to 4.5MB limit)
```

**What Tauri replaces vs the relay path:**

| Step | Relay Path | Tauri Transport Path |
| :--- | :--- | :--- |
| Command delivery | Redis queue (LPUSH/RPOP) | Local WebSocket (direct) |
| Result delivery | Redis SETEX → Vercel response | Local HTTP response (direct) |
| Image data to Vercel? | Yes — twice (relay response + Miro update) | Yes — once (Miro update only) |
| Redis cost | ~5–10 commands per sync run | $0 (no Redis used) |
| Vercel invocations per sync | 2 (relay request + Miro update) | 1 (Miro update only) |
| Browser compatibility | All modern browsers (public HTTPS) | **Miro Desktop / Electron only** (Chrome PNA blocks browser→localhost) |

**Tauri transport eliminates one Vercel hop** (the relay response — step 2 in the Penpot relay path), but the image still passes through Vercel via `/api/miro/update-image`. The 4.5MB limit still applies unless Tauri also handles the Miro API upload directly (see item #5 in the Tauri Capability Extender backlog — **Large Image Transport >4.5MB**).

**Important caveat for self-hosters:** Tauri transport only works from **Miro Desktop (Electron)** because Chrome blocks all browser→localhost requests from public origins with PNA. It does not work from miro.com in a regular browser. If your users primarily use Miro in a browser, the relay path is the only option regardless of whether Tauri is installed.
