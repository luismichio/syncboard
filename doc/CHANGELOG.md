# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.12.0] - 2026-08-05

### Added
- **Proactive Token Keep-Alive (Miro Plugin):** New 25-minute background interval in `useAuthTokens.ts` silently refreshes both Figma and Miro tokens before they reach the 5-minute expiry buffer. Prevents the "token expired mid-session" cascade that forced users to reconnect.
- **Figma Token Validation on Startup:** After loading tokens, the plugin now calls `GET /api/figma/verify` (lightweight `/v1/me` check) to detect server-side revocation. If the token is invalid, the UI state clears immediately (gray icon) instead of staying green until the first sync failure.
- **New `/api/figma/verify` Endpoint:** Proxies a call to Figma's `/v1/me` endpoint with 5s timeout. Returns `{ valid: true }` on success, 401 on invalid/expired token.

### Changed
- **Token Refresh Timeout:** `REFRESH_TIMEOUT_MS` in `src/lib/tokens.ts` increased from 7s to 15s, and `PROVIDER_TIMEOUT_MS` in the refresh API route increased from 8s to 15s. Provides sufficient runway for Vercel cold starts (~3-5s) plus OAuth provider latency without timing out.
- **Headless SDK Wait:** Miro SDK detection timeout in `useMiroSelection.ts` increased from 8s to 20s for headless (app icon) mode, with up to 3 retries at 5s intervals. Panel mode uses the original 8s timeout with a single attempt. Mirrors the same retry pattern already proven in `useAuthTokens`.

### Fixed
- **Connection Stability Cascade:** The combination of longer timeouts, proactive keep-alive, and startup validation addresses the interconnected failure chain documented in v0.11.0 investigation:
  - Token refresh no longer races against cold-start serverless execution (15s > 10s Vercel max on cold boot).
  - Background keep-alive keeps Vercel instances warm for sync-initiated refreshes.
  - Startup validation catches server-side revoked tokens without waiting for a user action.

## [0.11.0] - 2026-07-24

### Added
- **Ably Channel Separation (Figma vs Penpot):** Figma and Penpot companion plugins now use separate Ably channels (`figma:{pairingId}` / `penpot:{pairingId}`) instead of both subscribing to `penpot:{pairingId}`. Eliminates cross-talk where Figma responses would appear in the Penpot Import tab (showing "unknown-file" with Figma frame names) and vice versa.
  - `src/lib/relayAbly.ts`: `publishPenpotCommand`, `isPenpotOnlineAbly`, `generateAblyToken` accept `platform` parameter.
  - `public/figma-companion-ui.html`: Changed Ably channel from `penpot:` to `figma:` prefix.
  - `src/app/miro-plugin/companionRelayClient.ts`: `getAblyConnection` and `callRelay` pass platform to token/channel. Cache key now includes `currentConnectedPlatform` to prevent stale connection reuse when switching tabs.
  - `src/app/api/relay/request/route.ts`: Accepts `platform` in request body.
  - `src/app/api/ably/token/route.ts`: Token generation uses platform-specific capability.

### Changed
- **Header Layout (Miro Plugin):** Logo now aligns with first text line (`items-start` + `mt-0.5`), version/tier moved to a centered footer above the status bar.
- **Miro Connection Icon:** Enlarged from `w-4 h-4` (16px) to `w-[18px] h-[18px]` for better visibility.
- **Version Bump:** 0.8.0 → 0.11.0 across all plugins. `figma-companion-ui.html` added to the injection script.
- **Color-Coded Status Bar:** Replaced the single string `syncStatus` with `SyncStatus { message, type }` where type is `'success' | 'error' | 'progress' | 'info'`. Footer renders with appropriate colors (green/red/amber/gray) and a pulsing dot during progress states. Type is inferred from message content automatically for backward compatibility.

### Fixed
- **"Selected Frame" Name Overwrite in Sync:** Three-layer fix preventing the Penpot companion plugin's default name `'Selected Frame'` from overwriting real widget names:
  - `public/penpot-companion-plugin.js`: Changed default `shapeName` from `'Selected Frame'` to `null` when `findShapeById` returns null.
  - `src/app/miro-plugin/useMiroSync.ts`: `nameCache` now rejects `content.name === 'Selected Frame'`.
  - `src/app/miro-plugin/usePenpotImporter.ts`: Both `setPenpotNodeInfo` and `resolvedName` reject the placeholder.
- **Ably Connection Cache Miss:** `getAblyConnection` now includes `currentConnectedPlatform` in the cache key, preventing stale connections when switching between Figma and Penpot with the same pairing ID.

## [0.10.0] - 2026-07-22

### Added
- **"Replace Selected" — Adopt Any Image into SyncBoard:** New button in Import tab that replaces a manually-pasted or third-party image widget with a SyncBoard-managed copy, keeping the widget ID intact to preserve connectors, comments, links, and frame membership.
  - "Replace selected" button below each Import button (Figma/Penpot), enabled when a frame is selected.
  - Reads the current Miro board selection and adopts any image-type widgets.
  - Attaches `syncboard` metadata (adoption) or updates it (re-targeting to a different frame).
  - Then renders and pushes the new image via the standard sync API.
  - Non-SyncBoard images become recognised copies; existing SyncBoard widgets can be re-targeted to a different frame.
- **SEO & Analytics Overhaul:** Made the public site discoverable and measurable.
  - Added `robots.ts` (disallow `/api/` and `/miro-plugin`) and dynamic `sitemap.ts` covering all docs pages.
  - Added Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`) and Twitter Cards (`summary_large_image`).
  - Added JSON-LD structured data (`WebSite` schema), canonical URL, and `meta keywords`.
  - Added `generateMetadata()` per doc page for unique titles/descriptions; fixed breadcrumb `<span>` → `<h1>`.
  - Added Google Analytics (G-Q4W94QDWWC) with gtag tracking for page views.
  - Added custom event tracking: `sync_start`, `sync_complete`, `sync_error`, `oauth_attempt`, `oauth_connect`, `oauth_disconnect`.
  - Added CookieConsent banner with accept/decline (hidden inside Miro plugin iframe).
  - Upgraded to Google Consent Mode v2: default `analytics_storage: 'denied'` before GA loads; grants on accept.
  - Added `GET /api/health` endpoint returning `{ status, name, version, timestamp, uptime }`.

### Fixed
- **Code block contrast (WCAG AA):** Light-mode syntax highlighting colors now pass 4.5:1 minimum contrast ratio against the cream code background (`#e8e4dc`). Keywords dark teal `#005a73`, strings dark green `#0d6e30`, functions dark violet `#5b1fa8`. Dark mode unchanged.

## [0.9.0] - 2026-07-20

### Added
- **"Preserve Widget Size" Option on Sync:** Added a checkbox in the Sync panel that allows users to refresh image content only — without resizing the widget — preserving any manual crop, scale, or layout adjustments made in Miro.
  - New "Preserve widget size" checkbox in the sync panel, positioned between "Also update all board copies" and "Propagate format & scale".
  - When checked, the API skips the geometry PATCH (Step 2) and only uploads the image.
  - Handles aspect ratio shifts by setting Miro's `style.fit: "contain"` property rather than stretching the image.
  - Defaults to unchecked (current resize-on-sync behavior) to avoid surprise.
  - Works independently of "Propagate format & scale".

## [0.8.0] - 2026-07-19

### Added
- **Event-Driven WebSocket Relay Architecture:** Refactored selection detection and image sync pipelines to eliminate server-side polling loops, reducing Upstash Redis command usage by 90% and Vercel serverless execution time by 95%.
  - **Direct Selection Transport (0 Redis Commands):** Figma and Penpot companion plugins publish selection details (`id`, `name`, `fileKey`) directly over Ably WebSockets to the Miro plugin sidebar, bypassing Redis entirely.
  - **Hybrid Image Export (3 Redis Commands):** Heavy base64 image exports are uploaded to Vercel/Redis, followed by publishing a tiny `'result-ready'` event notification over Ably. Miro receives the WebSocket event and reads/deletes the image payload in a single `GET /api/relay/response` call.
- **Client-Side Ably Bridge in Miro:** Integrated direct Ably WebSocket client connections inside the Miro plugin sidebar to listen for companion response events in real-time.
- **Unified Companion Relay Client:** Renamed `penpotMcpClient.ts` to `companionRelayClient.ts` to reflect its unified role as the Cloud Relay client for both Figma and Penpot companions.

### Fixed
- **Ably Publish Capability Permission:** Updated `generateAblyToken` in `src/lib/relayAbly.ts` to grant `['publish', 'subscribe', 'presence']` capabilities on pairing channels, resolving Ably `40160: Unable to publish message due to lacking publish capability` errors.
- **Subscription Race Condition:** Restructured `callRelay` inside `companionRelayClient.ts` to subscribe to Ably events and set up early-results buffering *before* sending HTTP trigger requests to Vercel, completely resolving 10-second timeout errors.
- **Penpot Export Shape Lookup:** Updated `findShapeById` in `public/penpot-companion-plugin.js` to prioritize active selection (`penpot.selection[0]`) and native `findShape` API methods, resolving `Penpot export API unavailable in this runtime` and `unknown-file` ID fallbacks.
- **Direct Cloud Relay Routing:** Removed legacy `http://127.0.0.1:3845/mcp` fetch fallbacks in `useFigmaImporter.ts`, eliminating browser Private Network Access (PNA) CORS warnings and 2-second connection delays on HTTPS.

### Security
- **Header-based Token Transmission:** Refactored `/api/miro/update-image` and `/api/oauth/refresh` to receive sensitive tokens via HTTP headers (`Authorization: Bearer`, `X-Figma-Token`, `X-Refresh-Token`) instead of POST body, preventing credential leakage in proxy/WAF logs.
- **Tauri Webview CSP Hardening:** Replaced disabled CSP (`null`) with a strict policy restricting scripts, styles, images, and connections to `'self'` only, mitigating XSS and code injection in the local bridge webview.

---

## [0.7.1] - 2026-07-18

### Added
- **Document-Level Figma Pairing:** Implemented a document-level linking system to support syncing from multiple different Figma files to a single Miro board without credential collisions.
  - Refactored `figma-plugin/code.js` to save and read pairing keys using document metadata storage APIs (`figma.root.setPluginData` / `figma.root.getPluginData`).
  - Added an inline **"Pair Figma Design File"** input box inside the hosted companion panel (`public/figma-companion-ui.html`) that prompts the user exactly once per file and links the document permanently.
  - Dynamically propagates the saved file key via query parameters when loading the companion iframe.
- **Limitation Documentation:** Documented the Figma public API security limitations (blocking automated `figma.fileKey` reads in Community plugins) and how self-hosters can enable it automatically using the `enablePrivatePluginApi` manifest flag in `doc/architecture.md` and `doc/faq.md`.

### Fixed
- **Ably Selection Bridge Sync:**
  - Corrected Ably event subscription from `'select'` to `'command'` in `public/figma-companion-ui.html` to align with the backend router protocol.
  - Appended the `pairingId` query parameters to the `/api/ably/token` token request inside the companion UI, resolving the HTTP 400 Bad Request error.
  - Prefixed the Ably channel key with `'penpot:'` to align with backend security tokens.

---

## [0.7.0] - 2026-07-17

### Added
- **Figma Companion Plugin (Cloud Relay):** Built a Figma companion plugin that enables real-time selection auto-detect over the cloud relay using Ably.
  - Created `figma-plugin/` directory containing `manifest.json`, local sandbox controller `code.js`, and `ui.html` message relay bridge.
  - Implemented the hosted `public/figma-companion-ui.html` static asset with pairing connection status indicators, Ably subscriptions, and parent window message listeners.
  - Added a configuration panel in the local plugin UI so self-hosts can easily point the companion to their own deployed SyncBoard domain URL.
  - Refactored `useFigmaImporter.ts` to fallback to Cloud Relay queries (Figma Companion) if the local Tauri MCP server/SyncBridge is not running.
- **White-Labeling & Marketplace Setup Docs:** Updated setup and architectural guides detailing the plug-and-play Community installation paths from official marketplaces, alongside a customization guide for renaming plugins, updating brand logo icons, and adjusting CSS theme variables.

---

## [0.6.2] - 2026-07-17

### Added
- **Ably and Upstash Badges:** Added Ably Realtime and Upstash Redis status badges to the top of `README.md`.

### Fixed
- **Companion Status Layout Simplification:** Renamed status labels to clearly distinguish between local and cloud connections, and removed the redundant third "Active Connection" status row from `public/penpot-companion-ui.html`.
- **Markdown Card Description Fallback Heuristic:** Updated `extractDescription` inside `src/lib/docs.ts` to skip headings, blockquotes, HTML tables, and badge links, allowing repository README card previews on the website to correctly extract the initial text introduction.

---

## [0.6.1] - 2026-07-16

### Added
- **FAQ Document:** Created a Frequently Asked Questions (FAQ) guide under `doc/faq.md` covering concurrent collaboration rules, metadata signatures, Chrome PNA network blocks, security configurations, and image format options.

### Fixed
- **Penpot Companion Window Height:** Increased the companion iframe height from `480` to `600` to prevent unnecessary vertical scrollbars in the Penpot editor interface.
- **Markdown Description Parsing:** Updated description extraction logic to read `description:` from YAML frontmatter first, preventing the FAQ page card from displaying the first question's answer as its description.
- **CRLF Line Endings Fix:** Refactored `getDocBySlug` to strip all carriage returns (`\r`) from the document content before MDX compilation. This resolves issues where trailing carriage returns (`\r`) in Windows line endings broke the MDX markdown parser, causing links/badges to show as raw text and the License document to render raw ````text`.
- **Inline Badges Rendering:** Added a CSS override for images in prose paragraphs to render markdown badges inline-block rather than stacking them vertically. Removed the raw `<table>` wrapper from `README.md` that was failing to parse in MDX.

---

## [0.6.0] - 2026-07-15

### Added
- **Community Plan Rate Limiting:** Token-based rate limiting that identifies users by their OAuth token hash (or Penpot pairingId) instead of IP, making it immune to VPN cycling. Edge middleware, per-endpoint `withRateLimit()` HOF, and global daily backstop (500 syncs/day all users).
- **Dual-backend rate limiter:** Auto-detects Redis (`@upstash/ratelimit`) if `UPSTASH_REDIS_REST_URL` is set, otherwise uses in-memory sliding window (persistent infra only). Falls back gracefully on Vercel without Redis.
- **Configurable via env vars:** 11 `RATE_LIMIT_COMMUNITY_*` variables for all per-endpoint and global limits, plus `RATE_LIMIT_ENABLED=false` to disable entirely.
- **Setup guide:** Rate limiting section in `doc/setup.md` with env var table and multi-layer explanation.
- **README callout:** Public demo notice with link to rate limiting docs.

## [0.5.7] - 2026-07-14

### Added
- **Secure Key Generation:** Migrated pairing ID and OAuth state generation to cryptographically secure random generators using `window.crypto.getRandomValues`.
- **Redis OAuth Token Cache:** Replaced the vulnerable global in-memory OAuth state cache with Upstash Redis storage featuring a 300-second TTL and automatic deletion on consumption.
- **CORS Origin Whitelisting:** Configured Tauri's local Axum bridge server to validate CORS `Origin` headers against a whitelist of trusted domains (`https://syncboard.luiskobayashi.com`, `http://localhost:3000`, `http://localhost:1420`).
- **Dynamic OAuth Host Detection:** Configured OAuth endpoints to dynamically parse request headers (`host` and `x-forwarded-proto`) to compute redirect URIs, resolving state/cookie CSRF errors on Vercel preview environments and custom subdomains.
- **Miro Direct Install Bypass:** Allowed empty state parameter validation in the Miro callback if no local CSRF cookie exists, enabling developers to install the app directly from the Miro Developer Dashboard (which does not provide a state parameter).

### Changed
- **Read-Only Pairing IDs:** Restricted the pairing ID input field in the Miro companion sidebar to be read-only (`readOnly={true}`) so users can only copy their generated keys, preventing weak/custom key injection.
- **Unified Penpot Cloud Transport:** Removed local Tauri bridge routes for Penpot communication, unifying all Penpot select and export commands over the secure cloud relay pathway (Ably + Redis).

### Removed
- **Orphan API Routes:** Cleaned up unused endpoints `GET /api/relay/penpot/poll` and `POST /api/relay/penpot/register`.
- **Orphan Tauri Bridge Route handlers:** Pruned legacy local WS (`/ws`), local polling (`/penpot/poll`), register (`/penpot/register`), result (`/penpot/result`), and local command triggers (`/detect-penpot`, `/export-penpot`) from the Tauri desktop app's Axum server.
- **Obsolete Temp Files:** Deleted scratch files `._temp_comp.html` and `_temp_section.txt`.

### Fixed
- **API Error Leakage Sanitization:** Sanitized output exceptions in OAuth refresh and Miro image update endpoints to return generic error messages instead of raw system stack traces.

## [0.5.6] - 2026-07-14

### Added
- **Penpot Natural Dimensions:** Companion export and selection responses now include shape width/height from selrect. Stored in widget metadata during import and used as canonical display size for sync resize calculations.
- **Widget Metadata Update After Sync:** After each PATCH succeeds, widget metadata (format, scale, width, height) is refreshed via the Miro Web SDK so the format/scale dropdown shows current values on next selection.
- `getById(id)` added to MiroBoard type definition.

### Fixed
- **Miro Token Stale-Expiry on Sync:** `syncSelectedScreens` now calls `getValidToken('miro')` at the start to auto-refresh the token before syncing, instead of relying on the mount-time token.
- **Penpot Import Width Hardcode:** Removed `width: 800` from `createImage()` in `usePenpotImporter.ts` (same fix previously applied to Figma).
- **Missing Width in Selection State:** `SyncedImage` now includes width from the Miro widget. The sync selected-items path passes width to the PATCH endpoint, enabling resize.
- **No Scale Passed to Penpot Export in Sync:** The `export_shape` call was missing the scale parameter --- always defaulted to 2 during propagate. Now passes `target.scale` so the selected scale takes effect.
- **Render Cache Key Collisions:** Cache keys now include scale (`fileKey|nodeId|format|scale`) for both Figma and Penpot, preventing collisions when copies have different scales.
- **Companion Plugin Status Stuck on Unknown:** Handshake waited for a `ui-ready` message that is never received by the UI. Now sets plugin status to Connected on `theme-change` (the plugin's actual handshake response).
- **SVG Widget 0-Width Resize Fail:** Miro SDK returns `width: 0` for SVG image widgets. Width calculation now handles 0-width gracefully --- uses stored natural width when available, otherwise skips geometry (lets Miro auto-size).
- **Miro PATCH Geometry Override by Async Image Processing:** Miro's image-specific PATCH overrides `geometry.width` with the new image's pixel dimensions after async processing. Fixed by splitting into two steps: (1) upload image via image endpoint (no geometry), (2) apply geometry via generic item endpoint (JSON body) which updates the widget data model directly without triggering image reprocessing.

### Changed
- **Penpot Import Display Width:** Display width now calculated as `naturalWidth x exportScale` (not fixed at natural width). Widgets visually scale with export resolution: 1x=400px, 2x=800px, 4x=1600px.
- **Sync Resize Uses Natural Width:** For Penpot items with stored natural width, display width = `naturalWidth x effectiveScale`. Propagate changes now resize the widget proportionally.
- **Export Filename in Miro PATCH:** Image filename sent to Miro uses the actual `nodeName` instead of hardcoded `screenshot.png`. Sanitizes invalid filename characters.

## [0.5.5] - 2026-07-11

### Added
- **Ably WebSocket Transport for Penpot Commands:** Replaced Redis polling for command delivery with Ably pub/sub. Companion now subscribes to an Ably channel via WebSocket for near-instant command delivery with zero idle Redis cost.
  - Added `src/lib/relayAbly.ts` --- Ably REST helpers for publishing commands and token generation.
  - Added `POST /api/ably/token` endpoint --- generates scoped subscribe-only tokens for companion authentication.
  - Updated `POST /api/relay/request` --- publishes commands via Ably instead of Redis LPUSH.
  - Updated `public/penpot-companion-ui.html` --- replaced polling loop with Ably Realtime WebSocket subscription.
- **Presence via Ably:** Companion enters Ably channel presence on connect; `/api/relay/request` checks Ably presence REST API (instead of Redis SETEX) to determine if companion is online.

### Removed
- Redis-based `enqueuePenpotCommand`, `dequeuePenpotCommand`, `isPenpotOnline` functions (command delivery fully migrated to Ably).
- Period heartbeat to `/api/relay/penpot/register` (no longer needed --- Ably presence replaces it).

### Notes
- **Result storage remains on Redis** (`storeRelayResponse`/`getRelayResponse`/`deleteRelayResponse`) --- these are only used during active imports, with negligible idle cost.
- **Fallback endpoints preserved:** `/api/relay/penpot/poll` (BRPOP) and `/api/relay/penpot/register` remain operational for non-Ably clients.
- Requires `ABLY_API_KEY` environment variable. Free tier (200k messages/month) is sufficient.

## [0.5.4] - 2026-07-11

### Changed
- **Penpot Relay Transport:** Switched companion command retrieval from short polling to long-polling. `/api/relay/penpot/poll` now blocks up to 45s waiting for queued commands (BRPOP), then responds immediately when work arrives.
- **Companion Poll Loop:** Updated `public/penpot-companion-ui.html` to use persistent long-poll cycles (no 2s idle spin loop), reducing relay command churn while keeping near-real-time command pickup.
- **Presence Heartbeat Strategy:** Removed per-poll presence writes. Companion now sends explicit heartbeat registration at connect and every 60s, preventing extra Redis writes on every empty poll cycle.

## [0.5.3] - 2026-07-11

### Fixed
- **Miro Connection Reliability (Yellow Forever):** Refactored token bootstrap in `useAuthTokens.ts` to prevent perpetual loading states with bounded retries and deterministic loading-settle behavior.
- **Miro SDK Storage Proxy Errors:** Hardened `src/lib/tokens.ts` with strict runtime callability checks for `board.storage.get/set` plus short operation timeouts and localStorage fallback.
- **OAuth Refresh Stall Protection:** Added timeout handling in both client refresh calls (`tokens.ts`) and provider refresh route (`/api/oauth/refresh`) to prevent hanging refresh chains.
- **React Hydration Error #418:** Removed SSR/client mismatch sources in Miro plugin initialization by moving client-only reads (`window.location`, `localStorage`, random pairing id generation) to mount-time effects.
- **Miro OAuth Connected-but-Gray Regression:** Normalized OAuth token payload handling in `useAuthTokens.ts` so Miro callbacks/polling accept valid access tokens even when `refreshToken` is missing.
- **Miro Callback Token Shape Robustness:** Updated `src/app/api/oauth/miro/callback/route.ts` to always serialize `accessToken`/`refreshToken`/`teamId` as strings for stable popup handoff payloads.
- **Token Reload Tolerance:** Updated `src/lib/tokens.ts` parsing to tolerate tokens without `refreshToken` (fallback `''`) and keep using valid access tokens until actual expiry when refresh tokens are absent.
- **Penpot Companion Theme Mismatch:** Added explicit UI-ready handshake (`ui-ready`) between `public/penpot-companion-ui.html` and `public/penpot-companion-plugin.js`, with theme normalization and startup fallback.

## [0.5.2] - 2026-07-11

### Added
- **Import Format & Scale Selectors:** Added format (SVG/PNG) and scale (1x-4x, visible when PNG selected) dropdowns to both Figma and Penpot node info cards in the import tab, matching the sync grouped-card UI. `importFigmaScreen` and `importPenpotScreen` now accept `format` and `scale` parameters.

### Fixed
- **Figma MCP Tool Name (SyncBridge & Browser Fallback):** Updated `get_design_context` -> `get_selection` in both `tauri-bridge/src-tauri/src/lib.rs` and `src/app/miro-plugin/useFigmaImporter.ts` to match the current Figma Desktop MCP API.
- **Penpot Companion Polling Flood:** Added 2-second delay (`await sleep(2000)`) between poll iterations in `public/penpot-companion-ui.html` to prevent ~1,000 Redis commands/second when idle. Tight loop was the cause of unexpectedly high Redis consumption (~2,600 commands for 10-20 syncs).

## [0.5.1] - 2026-07-11

### Added
- **Penpot Relay API (Upstash-backed):** Added `/api/relay/request`, `/api/relay/penpot/register`, `/api/relay/penpot/poll`, and `/api/relay/penpot/result` to relay Penpot selection/export commands over public HTTPS instead of localhost transport.
- **Relay Store Module:** Added `src/lib/relayRedis.ts` with strict typed command queue helpers, presence heartbeat keys, response TTL caching, and key sanitization.

### Changed
- **Penpot Transport Default:** `src/app/miro-plugin/penpotMcpClient.ts` now defaults to cloud relay mode and keeps SyncBridge/Tauri as an optional fallback.
- **Companion UI Endpoint Routing:** `public/penpot-companion-ui.html` now talks to `/api/relay/penpot/*` endpoints and no longer depends on `targetAddressSpace` localhost access.
- **Settings UX:** Pairing ID is now always visible in the Miro plugin settings so Penpot can pair in both relay and SyncBridge modes.

### Fixed
- **PNA/LNA Block in Penpot Web Context:** Removed hard dependency on browser-to-localhost calls for Penpot sync path, preventing `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` in relay mode.

### Documentation
- **Architecture Reassessment:** Updated `doc/architecture.md` with phase 7 (cloud-relay-first + Tauri as capability extender), revised sections 1.B, 2, and 5.B to reflect relay-first reality.
- **Backlog Restructure:** `doc/backlog.md` reorganized with new "Tauri Capability Extender" section (large images, Adobe UXP, local LLMs, compression, document parsing, two-way sync, multi-whiteboard) and an Icebox for archived bridge architectures.

## [0.5.0] - 2026-07-11

### Fixed
- **Penpot PNA Bypass:** Replaced WebSocket connection in Penpot companion plugin with HTTP `fetch()` polling to bypass Chrome's Private Network Access restrictions. The `fetch()` API supports `targetAddressSpace: 'loopback'` which allows public web pages (Penpot) to connect to local loopback servers (SyncBridge) after user approval.
- **Bridge HTTP Polling:** Added three new SyncBridge endpoints for HTTP-based command queuing: `POST /penpot/register`, `GET /penpot/poll`, and `POST /penpot/result`. The companion plugin now polls for commands every ~1 second instead of maintaining a WebSocket connection.
- **Command Queue Architecture:** Modified `handle_detect_penpot` and `handle_export_penpot` to enqueue commands in a per-pairingId queue instead of sending via WebSocket. The polling handler (`handle_penpot_poll`) waits up to 30 seconds for commands using long-poll with tokio `Notify` signaling.

## [0.4.0] - 2026-07-11

### Added
- **Documentation Site:** Replaced `/dashboard` with a full documentation site at `/docs`. Renders `doc/*.md` as styled pages with TOC sidebar, syntax highlighting, heading anchor links, and a metadata bar (last updated, word count).
- **Agent-Friendly Docs API:** Added `GET /api/docs/list` (JSON index) and `GET /api/docs/raw?file=<filename>` (raw markdown) for AI agent consumption. `backlog.md` is hidden from public.
- **Token Fingerprinting:** Token storage keys now include a `deploymentFingerprint()` hash of `window.location.origin` to prevent collisions across SyncBoard deployments.
- **19 API Route Tests:** Test suites for `/api/figma/render`, `/api/figma/render-batch`, `/api/figma/node-info`, and `/api/miro/update-image` (38 total, all passing).

### Changed
- **Token Refresh Resilience:** `getValidToken()` no longer clears the token on a single refresh failure. The old token stays in storage and retries on the next page load, preventing unnecessary re-authentication from transient failures.
- **Enhanced Bridge Logging:** All SyncBridge events now show `[Service]` prefixes (`[Bridge]`, `[Figma]`, `[Penpot]`) with pairing IDs, shape names, file keys, and session counts.

### Fixed
- **Penpot WebSocket PNA:** Added explicit `OPTIONS` handler for the `/ws` route in the bridge. Chrome's Private Network Access preflight is now properly answered with `Access-Control-Allow-Private-Network: true`, fixing `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`.

## [0.3.0] - 2026-07-11

### Added
- **Penpot Manifest File:** Created `public/penpot-manifest.json` specifying metadata, permissions, entry point, and icon links to enable native custom plugin registration inside the Penpot Workspace editor.

## [0.2.3] - 2026-07-11

### Changed
- **Unified Badge Accent Colors:** Updated both Figma and Penpot transparent outline selection badges in the Sync tab to use the exact same cyan brand accent color (`text-accent` and `border-accent/40`) for UI design consistency.

## [0.2.2] - 2026-07-11

### Changed
- **Clean Platform Badges:** Replaced dark background colored badges in the Sync tab selection cards with transparent background, outline-only badges styled in each platform's accent color (neon green for Figma, purple for Penpot).

### Removed
- **Redundant Penpot Card:** Completely removed the redundant disabled "Penpot Syncing - INACTIVE" card from the Settings panel when SyncBridge is disconnected. All local workspace pairing states are now cleanly represented by the SyncBridge card itself.

## [0.2.1] - 2026-07-11

### Changed
- **SyncBridge Rebranding:** Renamed all occurrences of "Tauri Desktop Bridge" to "SyncBridge" across the codebase, user interface, error messages, and documentation.
- **SyncBridge UI Alignment:** Aligned the SyncBridge connection card in the Settings panel to match the Connect/Disconnect pattern of Figma and Miro (replacing the toggle checkbox).

### Fixed
- **Tokio Runtime Panic:** Switched background server thread initialization from `tokio::spawn` to `tauri::async_runtime::spawn` to resolve the "there is no reactor running" startup panic in the compiled binary.
- **Penpot Selection Pointers:** Cleaned up outdated selection error tip reminders inside `usePenpotImporter.ts`.

## [0.2.0] - 2026-07-11

### Added
- **Tauri Desktop App Workspace:** Initialized standard Tauri v2 application inside `/tauri-bridge` using Yarn and Vanilla TypeScript template.
- **Axum Local Secure Server:** Implemented Axum HTTPS local web server on port `4401` using rustls-tls to route selection detection and exports.
- **WebSocket Pairing Router:** Setup a thread-safe connection mapping WebSocket upgrade path in Axum to pair and relay commands to/from active Penpot browser tabs.
- **Figma desktop relay:** Structured automatic local HTTP selection query forwarding to Figma desktop's MCP instance on port `3845`.
- **Automated CI/CD Release Pipeline:** Created `.github/workflows/release-tauri.yml` which automatically compiles `.msi`, `.exe`, `.dmg`, `.app`, and `.deb` installers using GitHub actions upon tagging releases.
- **Bridge Documentation:** Added `doc/tauri-setup.md` detailing prerequisites, Let's Encrypt certificates installation, and GitHub Action releases.

## [0.1.11] - 2026-07-11

### Added
- **Tauri HTTPS Bridge & Penpot Companion Plugin Schema:** Created the system specifications and architecture design for the loopback bridge.
- **Penpot Companion Plugin:** Created `penpot-companion-plugin.html` script which connects the Penpot editor tab directly to the Tauri proxy over WebSockets.
- **Tauri client support:** Configured `penpotMcpClient.ts` to connect to Tauri secure loopback `local.syncboard.com` when the bridge toggle is active.
- **Figma Tauri support:** Enabled local Figma selection detection through the Tauri proxy inside `useFigmaImporter.ts`.
- **Sidebar settings toggle:** Added a Connect/Disconnect widget in the settings tab for "SyncBridge" along with a pairing ID generator and clipboard copy utility.

### Removed
- **Penpot MCP Server Client:** Deleted all redundant Penpot MCP server connection code from `penpotMcpClient.ts`, transitioning exclusively to the Tauri secure loopback bridge.

## [0.1.10] - 2026-07-10

### Added
- **Penpot Sync Integration:** Added support for syncing Penpot frames to the Miro canvas side-by-side with Figma.
- **Penpot MCP Client Integration:** Created `penpotMcpClient.ts` communicating with the local Penpot MCP server over HTTP JSON-RPC POST requests to prevent SSE timeout locks.
- **Penpot Client Importer:** Built `usePenpotImporter.ts` validating frame URLs, detecting selection frames, and placing SVGs on the canvas.
- **Miro Update API Platform Handling:** Updated `/api/miro/update-image` to support and output platform-specific title tags (`PenpotSync` vs. `SyncBoard`).
- **Consolidated Selection UI:** Grouped duplicate canvas screens in the sidebar under a single frame card, rendering a copy counter badge (e.g. `x3`) in the top-right and batch-applying format/scale changes to all selected copies.
- **CORS Support for Penpot MCP:** Patched the local Penpot MCP server code (`PenpotMcpServer.ts`) to support cross-origin requests, enabling browser-based plugin communication.

## [0.1.9] - 2026-07-10

### Added
- **SVG Vector Support:** Integrated vector format rendering, enabling users to sync screens as SVGs on the Miro board for infinite zoom crispness.
- **Per-Image Formatting & Scaling:** Added interactive Format (PNG/SVG) and Scale (1x, 2x, 3x, 4x) controls in the Sync sidebar panel for each selected image widget, dynamically stored inside Miro's metadata.
- **Preferences Panel:** Added a global "Default PNG Scale" configuration dropdown inside the settings tab to set the default scale for newly imported images.
- **Mixed Batch Grouping:** Upgraded the rendering engine to group requests by fileKey + format + scale, keeping mixed sync selections batched and optimized.

## [0.1.8] - 2026-07-10

### Added
- **Vitest Unit Test Suite:** Configured Vitest and jsdom environments for frontend testing. Added test coverage for Figma URL parsing and OAuth token validation helpers.
- **Husky Pre-Push Hook:** Added automated pre-push hook integration ensuring lint, test, and production builds pass before any git push.
- **Themed Auth Popups:** Integrated a dynamic, client-side script in all OAuth auth and callback popup windows to detect the active theme configuration (`light`, `dark`, or `system` pref) from localStorage and dynamically style background, text, buttons, and loading states to match.
- **Name-First Title Format:** Changed the image title structure to show the clean human-readable design name first, followed by the sync metadata (`Name [SyncBoard|fileKey|nodeId]`). Adapted selection hook parsing, fallback generation, and copy-matching logic accordingly.

### Fixed
- **OAuth CSRF Security:** Implemented cryptographic random `state` validation via secure, HTTP-only cookie validation for Figma and Miro callback routes.
- **Safe Token Serialization:** Transitioned from unsafe string template literals to robust `JSON.stringify` serialization on authorization success callback frames to prevent script crash and potential injection.
- **Verbose Console Logs Cleanups:** Removed development debugging logs from `useMiroSelection.ts` to follow production standards.

---

## [0.1.7] - 2026-07-09

### Fixed
- **Iframe Token Write Missing:** Fixed the core token persistence bug by updating the `postMessage` and `BroadcastChannel` event handlers inside `useAuthTokens.ts` to explicitly call `saveToken()` when receiving successful authentication results from the OAuth popups. This ensures credentials are saved to Miro's board storage right away instead of only existing in temporary component memory.

---

## [0.1.6] - 2026-07-09

### Added
- **SyncBoard Custom Logo:** Integrated `public/syncboard_logo.svg` as the application's favicon and main sidebar logo, styled with dynamic CSS mask-image logic.
- **Offline Font Optimization:** Replaced external Google Font loads with standard system font fallback stacks, preventing Next.js Turbopack compilation crashes in offline or restricted-network environments.

---

## [0.1.5] - 2026-07-09

### Added
- **Dynamic Public SVG Masks:** Migrated connection status indicators to use `/Figma.svg` and `/Miro.svg` assets from the public directory. Applied CSS `mask-image` in `page.tsx` to colorize them into monochrome theme states (muted gray when disconnected, neon green/purple accent when connected).

### Fixed
- **Miro Storage Typings Parity:** Reverted `lib/tokens.ts` to use direct `storage.get` and `storage.set` API parameters, resolving TypeScript compilation errors while keeping the initialization poll delay intact to guarantee token persistence on reload.

---

## [0.1.4] - 2026-07-09

### Added
- **Connection Status Indicators:** Added Figma and Miro status icons to the top-right corner of the App Header. The SVGs remain light gray (`text-text-muted/20`) when disconnected and light up in active green/purple (`text-accent`) when authorized.

### Fixed
- **Token Persistence on Refresh:** Fixed a race condition where tokens failed to load on page reload. `useAuthTokens` now polls and waits for `window.miro.board` initialization before querying board storage, preventing default browser third-party `localStorage` blocks inside the Miro iframe environment.

---

## [0.1.3] - 2026-07-09

### Fixed
- **Theme Hydration Cascading Renders:** Wrapped theme loading state setter inside `requestAnimationFrame` to defer updates to the next microtask, preventing Next.js hydration warning loops.
- **Access Before Declaration:** Moved local declaration blocks in `ThemeToggle.tsx` above usage patterns.
- **Unused Variable Warnings:** Removed unused imports (`useEffect`, `TokenData`), unused error parameters in try-catch statements, and unused Request signatures in Next.js OAuth API route handlers.

---

## [0.1.2] - 2026-07-09

### Added
- **Vercel Serverless Configurations:** Created `vercel.json` to extend the serverless function execution timeout `maxDuration` to 60 seconds (applicable for Pro/Enterprise) to support heavy asset downloads.

### Changed
- **Vercel Deploy Destination:** Updated the target destination repository URL in the "Deploy with Vercel" markdown button to point to the active `luismichio/syncboard` repository.
- **Rate Limits Documentation:** Expanded the `README.md` to detail both Figma and Miro rate limits, highlighting plan limitations (Starter vs. Pro) and the built-in Miro request throttle delay.

---

## [0.1.1] - 2026-07-09

### Added
- **Render Batching API:** Added `/api/figma/render-batch` serverless route accepting multiple node IDs to render and download assets in a single Figma API request, minimizing quota usage.
- **Miro Sync Copy Option:** Added a toggle checkbox "Also update all board copies" to the Sync tab.
- **Enriched 429 Error Fields:** Extracted Figma-specific rate limiting headers (`X-Figma-Plan-Tier`, `X-Figma-Rate-Limit-Type`, `Retry-After`) and bubble them up to the UI status message.

### Changed
- **Default Sync Scope:** Refactored `useMiroSync` to update only the selected board items by default (rather than scanning the entire board for copies).
- **Deduplicated Rendering:** Sync now fetches Figma renders exactly once per unique node ID and distributes the data url to all Miro matching widgets, reducing redundant API hits to 0 for duplicated widgets.
- **Error Handling:** Client-side error messages now present structured details showing Plan Tiers, Seat Types, and dynamic cooldown counts.

---

## [0.1.0] - 2026-07-08

### Added
- **Tabbed Plugin Layout:** Rebuilt the sidebar UI in `src/app/miro-plugin/page.tsx` into an organized 3-tab layout (Sync Selection, Import Screen, Settings) to suit narrow plugin sidebar views.
- **Disconnect Actions:** Added UI buttons to disconnect Miro and Figma connections and flush tokens from localStorage/board storage.
- **Iframe Message Listener:** Implemented a `window.addEventListener('message')` listener inside `useAuthTokens.ts` to bypass standard BroadcastChannel partitioning issues during OAuth popup redirection.

### Fixed
- **Miro SDK v2 Promise Proxy Crash:** Resolved standard `SdkError: Cannot call method '.then()'` runtime errors by wrapping proxy board resolutions into static objects.
- **Lazy State Hydration:** Refactored the main coordinator state hooks in `useMiroPlugin.ts` to use functional lazy initializers, resolving React cascading rendering warnings.
- **TypeScript Strict Types:** Cleaned up code structure, replacing all standard `any` type overrides with strict type definitions.
