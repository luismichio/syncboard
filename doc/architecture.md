# 📐 SyncBoard Architecture & System Design

SyncBoard is a stateless design-to-canvas sync engine designed to fetch, render, and update screenshots in-place on Miro boards. It supports both **Figma** and **Penpot** design pipelines.

---

## 🧭 1. Dual-Platform Rendering Strategy

SyncBoard utilizes two distinct sync strategies based on the capabilities of the source platforms:

```
                  ┌────────────────────────────────────────┐
                  │          Miro Desktop Client           │
                  └──────┬──────────────────────────┬──────┘
                         │                          │
           Figma Sync    │                          │ Penpot Sync
         (Cloud-Native)  │                          │ (Local Loopback)
                         ▼                          ▼
  ┌───────────────────────────────┐        ┌───────────────────────────────────┐
  │     SyncBoard Cloud API       │        │        Tauri Local Bridge         │
  │     (Next.js on Vercel)       │        │   (https://local-syncboard.luiskobayashi.com)   │
  └──────────────┬────────────────┘        └────────────────┬──────────────────┘
                 │                                          │
                 ▼ Cloud REST Fetch                         ▼ Local WSS
  ┌───────────────────────────────┐        ┌───────────────────────────────────┐
  │      Figma Cloud Servers      │        │        Penpot Browser Tab         │
  │     (api.figma.com/v1)        │        │      (design.penpot.app)          │
  └───────────────────────────────┘        └───────────────────────────────────┘
```

### A. Figma Sync (Cloud-Native)
Figma provides a robust, public web API that renders design frames to images in the cloud.
* **Flow:** The Miro plugin makes a request to the SyncBoard Next.js API. The server requests the frame render directly from Figma's cloud servers (`api.figma.com/v1/images`), downloads the image, and uploads it to the Miro widget.
* **Benefits:** Zero user configuration, no local servers, and no tunnels required.

### B. Penpot Sync (Local Loopback Bridge)
Penpot does not have a public cloud rendering API. To avoid requiring complex cloud containers running Puppeteer or local SSH tunnels, SyncBoard bridges the gap locally.
* **Flow:** The Miro plugin queries a local secure loopback server run by the **Tauri desktop app** on the designer's machine (`https://local-syncboard.luiskobayashi.com:4401`). The Tauri app sends an export request over WebSockets to the active **Penpot browser tab** where the designer is working. The Penpot tab renders the frame using Penpot's native plugin engine, converts it to base64, and returns it to Miro via Tauri.
* **Benefits:** 100% free of cloud database setup or tunnels. It works natively inside sandboxed environments like Miro Desktop App and Safari.

---

## 📡 2. Selection Detection & The Tauri Bridge

To support selection queries in Miro Desktop and Safari without mixed-content browser blockages (HTTPS loading HTTP localhost), Tauri runs a secure local loopback bridge:

1. **DNS Mapping:** The domain `local-syncboard.luiskobayashi.com` resolves via public DNS records to `127.0.0.1`.
2. **SSL Certs:** Tauri bundles a publicly-trusted Let's Encrypt certificate for `local-syncboard.luiskobayashi.com`. The browser trusts the connection out of the box.
3. **Figma Selection:** Tauri makes a direct local HTTP request to the local Figma Desktop port (`http://127.0.0.1:3845/mcp`) on the Rust side, bypassing browser sandboxes.
4. **Penpot Selection:** Tauri queries the Penpot Companion Plugin via the local WebSocket connection, which calls the native Penpot plugin API: `penpot.selection[0]`.

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
Unlike Figma, Penpot does not enforce API rate limits or monthly quotas for exports because the sync pipeline runs locally on the client machine via the Tauri bridge.
* **No Cloud Limits:** Syncing works entirely on the designer's machine, meaning there are **0 cloud requests** hitting Penpot's servers. You can sync unlimited frames for free with no pricing tiers.
* **Local Hardware Limits:** The export speed and memory consumption scale with the designer's computer hardware. Large files with thousands of complex vector elements may experience slightly longer render times.

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
