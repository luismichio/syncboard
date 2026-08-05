---
title: Changelog
description: Complete release history, version updates, feature additions, and bug fixes across SyncingBoard releases.
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.15.2] - 2026-08-04

### Added
- **Companion Token Cap (180 Max) & 20-Socket Miro Reserve:** Introduced `RATE_LIMIT_COMMUNITY_MAX_COMPANION_TOKENS` (default 180) to hard-cap active companion Ably tokens in Redis (`relay:active_companion_tokens`). Reserves a permanent 20-socket floor for Miro detectors, ensuring companion tab proliferation can never starve Miro sidebars.
- **Active-Pair Priority & Orphan Eviction:** When the 180 companion token ceiling is reached, companions paired with active Miro boards receive priority issuance. Orphan standby companions (companion tabs with no active Miro lease) are evicted starting with the oldest token and broadcast `{ event: 'companion_evicted' }` to render `"Standby (Slot granted to active sync)"`.
- **Companion 1-Tab-Per-Pairing & Transfer UX:** Added `/api/relay/companion/session` endpoint (`release` and `transfer`) and `relay:companion_session:{pairingId}` Redis keys. Second companion tabs for the same pairing receive `{ companionConflict: true }` and render an amber `"Companion Active in Another Tab"` banner with a 1-click **"Transfer Connection"** button.
- **Client-Side Ably Token Cache (R5):** Introduced 2-hour TTL client-side Ably token caching in `src/lib/ablyTokenCache.ts`. Eliminates redundant `/api/ably/token` HTTP roundtrips during active sessions.
- **Penpot Inline SVG Exports over Ably (R2):** SVG exports with compact payloads (serialized JSON < 12KB) now stream directly over Ably channels via `result` messages instead of the HTTP + Redis path; PNG/base64 and large payloads keep the Redis path.

### Changed
- **Optimized Relay Status Polling (R1):** Removed 30-second blind status polling intervals from `useRelayStatus`. Status is now polled on-demand during connection state transitions and gated by a 10-second serverless Redis deduplication cache (`SET NX EX`).
- **Removed Sync-Poll Loop (R4):** Removed the legacy 350ms Upstash Redis GET polling loop in `/api/relay/request/route.ts`. All callers now use async pub/sub transport.
- **Lua-Batched Rate-Limit Windows (R3):** Multi-window endpoints (relay 5/min + 30/hour + 100/day) now batch all windows in a single Redis EVAL via `checkMany` when the Redis backend is active (1 command instead of N), with a fallback to independent checks.

### Fixed (Figma Community review - post-release)
- **Figma Plugin Network Access:** The production manifest `allowedDomains` now includes the apex `https://syncingboard.com` (the `*.syncingboard.com` wildcard only covers subdomains). Dev-only origins (`gitpod.io`, `github.dev`) and the maintainer's personal `luiskobayashi.com` domain were removed from the plugin's network access; `devAllowedDomains` keeps only the standard localhost dev ports. The reviewer-facing *"This content is blocked. Contact the site owner to fix the issue."* error was Figma's plugin-UI `frame-src` CSP refusing the companion iframe when the submitted manifest lacked the production domain.
- **Zero-Setup Plugin UI:** Removed the custom-host Configure panel and the `clientStorage` host override from `figma-plugin/ui.html` + `code.js`; the plugin now always loads the companion from `https://www.syncingboard.com`. Self-hosters edit the `DEFAULT_HOST` constant in `ui.html` and list their domain in `allowedDomains`. Also stripped debug `console.log` noise from `code.js` for the submission artifact.

### Changed (post-release)
- **Preview host restored (optional):** the Figma plugin's footer now has a collapsed **"Preview host (optional)"** field for testing against a staging/tunnel host or self-hosting before production — persisted per plugin instance via `clientStorage`. Empty = production default (`https://www.syncingboard.com`); the host must be listed in `allowedDomains` (`devAllowedDomains` for dev plugins) due to the frame-src CSP.
- **Unlimited pool mode:** `RATE_LIMIT_COMMUNITY_MAX_RELAY_SESSIONS` and `RATE_LIMIT_COMMUNITY_MAX_COMPANION_TOKENS` now accept `0` for an unlimited pool (previously `0`/invalid input fell back to the default). Unlimited pools report the enforcement ceiling and never derive a `full` relay status; the Redis Lua caps are raised so the `count >= limit` guard never trips. The real ceiling remains your Ably plan's connection limit.

## [0.15.1] - 2026-08-03
### Added
- **1 Active Board Per Miro User (Session Binding):** The relay now binds each Miro user to a single board via `relay:user_board:{sha256(miro.currentUser.id)}` (30-minute TTL refreshed on every heartbeat). A user holding a lease on board A who starts syncing on board B is detected at token issuance — the new board receives `200 { conflict, activeBoardId }` instead of silently double-holding capacity. Guests with OAuth are first-class users; users without OAuth cannot sync and never hold a session (connections are lazy, so no server-side auth gate is needed).
- **One-Click Session Transfer UX:** Both boards (the current holder and the new board) show an amber **"Transfer Session"** card. One click repoints the binding via the Lua `transfer` action, frees the previous holder, then re-establishes the Ably client under the same session — no token re-issuance round-trip. The old board's next heartbeat reports the conflict and both sides converge on the same binding. The transfer button is gated by a 7-second cooldown.
- **Tauri Local Transport Indicator (C2):** The Rust bridge `/health` endpoint now returns `{ status, figmaConnected, miroConnected }` with real per-service connection tracking (`service_connections`). When the desktop bridge is active and Figma is connected, the sidebar shows a cyan **"Local Transport (0/40 slots used)"** card — the desktop relay bypasses the cloud pool, so the UI reflects actual slot usage.
- **Pure Decision Tables (M5):** `planAcquire` / `planTransfer` extract the binding rules (renew / grant / conflict / full) into exported pure functions mirrored by the Redis Lua script — 7 new unit tests cover renew, conflict, grant, full, and transfer paths without a Redis instance.
### Changed
- **Conflict at issuance, not after connect:** `/api/ably/token` detects the cross-board conflict before issuing a token (`200 { error: "relay_conflict" }`), distinct from capacity-full `429` + `Retry-After`; `/api/relay/status?userIdHash=&boardId=` returns `userConflict` + `activeBoardId` so the banner refetch converges instantly.
- **Legacy clients unchanged:** sessions without a user identity keep the previous pool-only semantics (heartbeat / acquire / release work exactly as before) — 0.14.1 compatibility preserved.

## [0.15.0] - 2026-08-03

### Added

- **Community Active Slot Counter (`/api/relay/status`):** New public endpoint reports live relay capacity — `{ activeSessions, maxSessions, globalSyncsToday, maxGlobalSyncs, status }` — with status levels `available` / `high_load` (≥75% of ceiling) / `full` (at ceiling). Polled by the Miro sidebar every 30 seconds.
- **Graceful Queue UX (Sync tab banner):** Live capacity banner with green (`Community Relay: n/40 slots`), amber (`High Demand`), and red (`Capacity Full`) states. When full, a manual **"Check again"** button replaces auto-retry, gated by a 7-second cooldown with a quiet countdown, so users cannot hammer retry.
- **Target/Source-Agnostic Relay Sessions:** Session leases renamed from Miro-specific (`relay:miro:sessions`, `acquireMiroRelaySession`) to generic relay naming (`relay:sessions`, `acquireRelaySession`) so one capacity pool covers Figma/Penpot → Miro today and FigJam/Mural later. New env `RATE_LIMIT_COMMUNITY_MAX_RELAY_SESSIONS` (default `40`); legacy alias `RATE_LIMIT_COMMUNITY_MAX_MIRO_RELAY_SESSIONS` still honored.
- **Global Daily Syncs Display Counter:** Best-effort `global_syncs_today` counter (24h TTL) incremented alongside the daily global backstop, so the status endpoint can surface community-wide usage.
- **Capacity Failure Messaging:** Ably auth failures caused by `relay_capacity_reached` now surface a clear "Community relay is at full capacity" message instead of a raw connection error.
- **Unit Tests:** `deriveRelayStatusLevel` boundary coverage (available/high_load/full at 40- and 60-slot ceilings).

### Changed

- **No paid upsell in queue UX:** The full-capacity hint points to the upcoming free desktop (Tauri) tier instead of a paid plan.

## [0.14.1] - 2026-08-02
### Security
- **Community Rate-Limit Enforcement:** Restored the documented Community defaults (Figma `5/min`, Miro image updates `10/min`), activated Figma `50/day` and relay `5/min + 30/hour + 100/day` windows, and excluded OAuth polling, Ably token issuance, node-info, and relay bookkeeping from the shared render/update resource budget.
- **OAuth Refresh Protection:** Added `RATE_LIMIT_COMMUNITY_OAUTH_REFRESH_PER_MIN` (default `3`) to rate-limit `/api/oauth/refresh` by a one-way refresh-token fingerprint without storing raw refresh tokens.
- **Ably Ghost-Connection Recovery:** Figma Companion now uses Ably `authUrl` token renewal and handles terminal connection states; the Miro relay client now invalidates terminal clients, closes after 60 seconds idle, and releases its socket on `pagehide`. This reduces persistent idle connection pressure on the Community Ably plan.
- **Relay Integrity & Community Capacity:** Export-result submissions now require a Redis-backed `requestId → pairingId` binding and are rate-keyed by pairing instead of unique request ID. Miro-only Ably tokens now use a Redis sorted-set lease, renewed every 15 minutes and released on idle/page-exit, with a default Community ceiling of 40 concurrent Miro relay sessions.
- **Community 429 Cooldown UX:** The Sync tab now distinguishes SyncingBoard `rate_limit_exceeded` responses from Figma provider 429s, reads `Retry-After`/reset metadata, disables repeated sync attempts, and displays a live Community cooldown countdown.
- **Relay Ghost-Path Hygiene:** Both companion UIs now clear their connect timeouts, bound unanswered selection/export requests to per-action timeouts, and leave presence on page exit. Relay result retention increased from 45 to 180 seconds, while the Miro relay client retries transient result 404s before failing.
- **OAuth Callback Rate Limiting:** `/api/oauth/figma/callback` and `/api/oauth/miro/callback` are now wrapped by the rate limiter (20/min per client IP), closing the last unwrapped token-exchange path. `/api/oauth/refresh` was already limited per refresh-token hash.
- **Relay Export Sub-Budget:** Heavy Penpot/Figma relay exports now draw from a dedicated per-pairing budget (2/min, 20/day) on top of the general relay limits, separating the costlier Ably + Redis + payload path from lightweight selections.
- **Figma node-info Error Transparency:** `node-info` now propagates upstream Figma 401/403/429 responses (with `Retry-After`/plan-tier metadata) instead of masking every failure as `{ name: "Pasted Screen" }`; only genuine 404s map to the fallback name. Clients already degrade gracefully on non-OK responses.
- **Provider Rate-Limit Awareness:** Miro 429 responses in `update-image` now honor `Retry-After` (capped at 10s) during geometry-retry backoff instead of a fixed 800ms delay, and the image upload surfaces `retryAfter` metadata.
- **Rate-Limit Header Transparency:** Successful responses from limited endpoints now include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` so clients can throttle proactively instead of discovering limits from a 429.
- **Identifier Hygiene:** The `figma:render` limiter no longer accepts `?token=` query values as identifiers — tokens are Authorization-header-only, matching the route contract.
- **Companion Readiness Signal:** Figma/Penpot companions enter Ably presence with a `ready` flag, and the relay server treats only ready members as online — distinguishing "present" from "ready to handle commands". Presence staleness after an abrupt disconnect (~2 min) remains documented as a free-tier residual.
- **Unenforced Knobs Removed:** `RATE_LIMIT_COMMUNITY_GLOBAL_BANDWIDTH_MB_PER_DAY` and `RATE_LIMIT_COMMUNITY_MAX_COMPANION_PAIRS` were advertised but never enforced; both are removed from code configuration, `.env.example`, and documentation. Community capacity control is the 40-session Miro relay lease.

### Changed
- **OAuth Polling Slowed:** Popup completion polling in `useAuthTokens` dropped from 1.5s to 4s intervals (~75 polls per 5-minute attempt instead of ~200), cutting avoidable edge/Redis traffic.
- **node-info Quota Protection & Manual Card Refresh:** Removed automatic `node-info` API calls from the sync loop in `useMiroSync` to preserve daily Figma API rate-limit quotas during routine syncs. Added a manual ↻ refresh button to each canvas screen card in the Sync tab so users can refresh frame names on demand when modified in Figma.
- **Global Backstop Reset Accuracy:** Updated `checkGlobalDailyBackstop` in `rate-limit.ts` to surface the backend Redis window reset timestamp directly, ensuring accurate client-side cooldown countdown timers in `useMiroSync`.
- **Cooldown Interval Stability:** Wrapped `setSyncStatus` with `useRef` in `useMiroSync` so parent re-renders do not recreate the 1-second cooldown timer interval.


## [0.14.0] - 2026-08-01
### Fixed
- **Keep Canvas Size — Geometry Preservation Rewrite:** Fixed the "Preserve widget size" feature (renamed "Keep canvas size") which was broken since its introduction in `0.10.0`. The root causes were: (1) the geometry PATCH used the wrong endpoint (`/items/{id}` with a JSON body) instead of the image-specific endpoint (`/images/{id}` with multipart form data); (2) the `preserveSize=true` path skipped the geometry write entirely, relying on an undocumented `style.fit: 'contain'` field that the Miro API ignores; (3) both paths were therefore always leaving the widget at Miro's auto-calculated size.

  New implementation: before the binary upload, the server reads the current canvas `geometry.width` via a snapshot GET. After the upload, it re-applies the target width via the correct image endpoint using a multipart form with up to 3 retry attempts, each followed by a GET verification to confirm the width stuck. Both paths now work correctly: `preserveSize=true` restores the pre-upload snapshot width; `preserveSize=false` applies the client-provided natural Figma/Penpot width.

- **UX Honesty — Crop Platform Limitation:** Renamed "Preserve widget size" to "Keep canvas size" and added a sub-note in all three occurrences (SyncTab, ImportTab Figma, ImportTab Penpot): *"Size locked. Crop resets — Miro API limitation."* Miro does not expose crop state (mask coordinates) in its REST API or Web SDK v2, so crop cannot be preserved programmatically. This is a hard platform ceiling, not a code limitation.


### Added
- **Undo (Ctrl+Z) Platform Notice & FAQ:** Added inline UI micro-notes (`API syncs cannot be undone with Ctrl+Z`) under primary action buttons in `SyncTab` and `ImportTab`, plus a dedicated entry in `doc/faq.md` under Technical Design & Constraints explaining that Miro API updates bypass client-side undo history.
- **Figma Companion Setup & Host Settings Documentation:** Updated `doc/setup.md` to explicitly document the first-time *"Pair Figma Design File"* prompt steps in the Figma Companion plugin, and updated self-hosting configuration instructions to reference the exact **SyncingBoard Host Settings** UI title.

## [0.13.6] - 2026-07-29
### Added
- **Interactive Quick Start Guide & Vercel 1-Click Deploy:** Implemented `QuickStartSection.tsx` on `/docs` with tabbed guides for Community (Cloud Hosted) vs Self-Hosted deployment. Added direct 1-click Miro install URL button (`Install to Miro Team ↗`) and official 1-click Vercel Deploy badges (`Deploy with Vercel`) across `/docs`, `README.md`, and `doc/setup.md`.
- **Figma Title Signature Standardization:** Standardized Figma widget title metadata signature from `[SyncingBoard|...]` to `[FigmaSync|...]` for 1:1 naming symmetry with Penpot's `[PenpotSync|...]`.
- **Plugin Manifest Network Scoping:** Scoped Figma companion plugin network permissions in `figma-plugin/manifest.json` by removing the overly broad `*.vercel.app` wildcard domain.
- **Documentation & FAQ Comprehensive Audit:** Updated `README.md` and `doc/faq.md` to clarify Figma Companion plugin scope (only needed for selection detection), updated fileKey resolution FAQ to explain multi-layered fallback, updated image download filename phrasing, replaced placeholder video embeds in `doc/features.md` with "Coming Soon" cards, updated `VideoTabGroupHydrator` to support `[class*='aspect-video']` placeholder containers so Figma/Penpot tabs hydrate properly, linked official [Security Policy (`/docs/security`)](/docs/security) and [Privacy Policy (`/docs/privacy`)](/docs/privacy), added platform API limits FAQ entry with a link to [Security, Rate Limits & Quotas Architecture](/docs/architecture-security-and-limits), fixed rehype doc link resolution for root markdown files, clarified enterprise commercial licensing availability (directing to `contact@syncingboard.com`), and added FAQ entries covering frame renaming, one-way sync safeguards, uninstallation persistence, and private Figma workspace support.

### Security
- **Header-Only Figma Token Transmission:** Removed `?token=` and `?Authorization=` query-parameter fallbacks from `/api/figma/render` to prevent OAuth tokens from appearing in HTTP logs, edge logs, or browser history.
- **Strict Miro CSRF State Enforcement:** Removed redundant `MIRO_ALLOW_DIRECT_INSTALL_NO_STATE` environment override to ensure state validation is consistently enforced for standard OAuth flows while retaining automatic direct link install detection.
- **Strict Parameter Format Validation:** Added regex format validation for `boardId` and `itemId` in `/api/miro/update-image` to prevent path traversal in Miro API URLs, and `pairingId` slug validation in `/api/ably/token` GET/POST endpoints.
- **Relay Request Body Sanitization:** Replaced unsafe type assertion in `/api/relay/request` with explicit object structure validation.
- **Upstash Redis Request Timeout:** Added a 10-second `AbortController` timeout to all Redis REST requests in `src/lib/relayRedis.ts` to prevent function stalls on transient network latency.
- **OAuth Callback Security Headers:** Injected `Content-Security-Policy` and `X-Content-Type-Options: nosniff` headers across Figma and Miro HTML callback responses.

### Fixed
- **Null-Safe HTML Entity Decoding:** Made `decodeHtmlEntities` null-safe and updated `useFigmaImporter.ts` initial `figmaNodeInfo.name` state from `null` to `'Loading...'`, preventing `TypeError` iframe crashes ("The page couldn't load") when pasting Figma links into the Miro plugin. Encoded `nodeId` in `/api/figma/node-info`.
- **Figma Render Route Test Suite:** Updated `src/app/api/figma/render/route.test.ts` to explicitly assert HTTP 401 rejection when tokens are passed via URL query parameters.
- **Security Policy Supported Versions:** Updated `SECURITY.md` supported versions matrix to reflect active security patching for `0.13.x`.

## [0.13.5] - 2026-07-27
### Added
- **Full-text interactive search engine:** Implemented relevancy scoring (+100 Title, +50 Heading, +30 Description, +10 Body), category hierarchy weighting, historical archive demotion (-60), `<mark>` search term highlighting, section deep-linking (`#heading-id`), and `Cmd+K` / `Ctrl+K` keyboard shortcut.
- **Dedicated Environment Variables Documentation:** Created `doc/environment-variables.md` with complete key reference, rate-limiting overrides, and `.env.example` templates, indexed under System Design & Adapter Modules.
- **Sticky Top Bar & TOC Offset:** Added sticky glassmorphism header (`sticky top-0 z-50 bg-bg-page/80 backdrop-blur-md`) with TOC top offset increased to `top-28` (`112px`) to eliminate text overlap under the top bar.
- **Homepage Action Bar:** Placed `[ Privacy ]`, `[ Cookie Settings ]`, and `[ Theme ]` in top-right action bar with uniform button heights.

### Changed
- **Setup Guide Reorganization:** Consolidated all HTTPS tunneling options (`cloudflared`, `ngrok`, `localtunnel`), local Miro Developer App settings, local Figma Companion import, local Penpot Companion import, and local Figma OAuth App config into Section 6 (`## Local Development`).
- **Heading Numbering Cleanup:** Removed numerical prefixes from section headers across `README.md`, `doc/setup.md`, and `doc/environment-variables.md` for consistent document styling.

### Fixed
- **Case-Insensitive Doc Routes:** Normalized slug lookups in `getDocBySlug()` so uppercase URL routes like `/docs/LICENSE` and `/docs/license` resolve 100% case-insensitively.
- **In-Page Filter Removal:** Removed stale `totalResults` ReferenceError and in-page card filtering from `DocsIndexClient.tsx` so all category cards remain 100% visible while searching.
- **Infrastructure & Cloud Limits:** Documented Vercel (4.5MB payload limit), Upstash Redis (10k req/day), and Ably Realtime (200k msgs/month) quotas in `doc/architecture/security-and-limits.md` with official documentation links.
- **Figma & Penpot Architecture Specs:** Updated `doc/architecture/sources.md` to clarify web/desktop selection relay support, Figma Companion scope, and `penpot.openPage()` API definition.

## [0.13.4] - 2026-07-27
### Added
- **Root-level documentation indexing:** Added scanner support for `README.md`, `CONTRIBUTING.md`, and `SECURITY.md` in `src/lib/docs.ts`, exposing them as public `/docs/contributing` and `/docs/security` pages.
- **Footer cookie settings button:** Created reusable `<CookieSettingsButton />` client component allowing users to reopen cookie preferences at any time from footers across public pages.
- **Reference documentation cards:** Displaying 6 full-featured cards (*Changelog*, *Privacy Policy*, *License & CLA*, *FAQ*, *Contribution Guidelines & CLA*, and *Security Policy*) under the Reference section on `/docs`.

### Changed
- **Documentation hub layout & typography:** Upgraded `/docs` with wide featured cards, cyan/blue outline borders (`border-accent/40`), and enhanced section category headers (`text-xl md:text-2xl font-black`).
- **Markdown style compliance:** Removed emojis across all markdown documentation files and documentation components in alignment with project design system standards.

### Fixed
- **Root doc path resolution bug:** Resolved `ENOENT` error in `getDocBySlug()` by adding explicit `ROOT_DOCS` set checking for root-level markdown files vs `doc/` sub-directories.
- **Case-insensitive doc slug generation:** Converted generated doc slugs to lowercase in `filenameToSlug()` so `CHANGELOG.md` correctly maps to `/docs/changelog`.
- **Dual-context markdown link resolution:** Configured relative markdown links (`./doc/setup.md`, `./doc/architecture.md`, `./LICENSE`) to resolve natively on GitHub and internally on the webpage.
- **Downloaded Miro image asset naming:** Background binary `File` header registration (`/api/miro/update-image`) ensures right-click image downloads in Miro retain original frame titles (`Frame Name.png`).

## [0.13.3] - 2026-07-26
### Added
- **Privacy policy page:** New `/docs/privacy` documenting all transient operational data (rate limit IP counters, 45s Redis relay buffers, 5min OAuth states), their legal bases under GDPR, and user rights. Landing page footer now links to it.
- **Architecture Spec Audit & Remediation:** Updated `doc/architecture.md` to align with `v0.13.3` implementation status — clarifying MCP Client/Server planned status, documenting token-hash rate limiting (`tok:sha256(token)`), geometry preservation (`preserveSize`), widget adoption/retargeting (`replaceSelectedWidget`), 300s Redis SETEX OAuth state handshake (`/api/oauth/store`), 16-char secure pairing ID masking/rotation (`pairingId.ts`), and HTML entity title sanitization (`decodeHtmlEntities`).
### Changed
- **Default scale 1x:** All scale defaults changed from 2x to 1x across 6 files — initial states, localStorage fallbacks, import parameter defaults, selection fallbacks, sync fallbacks, and companion relay client. New imports and syncs now default to 1x resolution.
- **Landing page footer:** Updated from "Zero data stored on server" to "Your designs never leave your tools. No accounts. No permanent storage." — accurate about no design data or permanent storage, while transparent about transient operational data (now documented on `/docs/privacy`).
### Fixed
- **Widget title on Place on Canvas:** Both Figma and Penpot import flows now re-assert the widget title via Miro SDK after the background `update-image` PATCH completes — matching the pattern already used in sync and replace flows. This prevents Miro's server-side HTML encoding from overwriting the decoded frame name after the PATCH response.

## [0.13.2] - 2026-07-25
### Security
- Escaped dynamic OAuth callback HTML error messages in both Figma and Miro callback routes to prevent reflected XSS (`escapeHtml` sanitization for query/provider error strings).
- Hardened `/api/oauth/store` with strict state/token payload validation and endpoint-level rate limits (`oauth:store:get`, `oauth:store:post`).
- Added overwrite protection for OAuth state cache keys using Redis `SET ... NX EX 300` semantics to prevent token-poison race overwrite.
- Added rate limiting and requestId format validation to `/api/relay/response`.
- Added strict input validation for `/api/figma/render-batch` (`fileKey`, `nodeIds`, `format`, `scale`) before proxying requests.
- Tightened Miro callback state policy with controlled direct-install bypass behind `MIRO_ALLOW_DIRECT_INSTALL_NO_STATE=true`.

### Fixed
- **Sync metadata integrity:** `handleGroupSettingChange` now merges updates into existing `syncingboard` metadata instead of overwriting the object, preserving `fileKey/nodeId/nodeName/platform/width/height`.
- **Post-sync metadata completeness:** `useMiroSync` now persists `fileKey`, `nodeId`, and `nodeName` in metadata updates so fallback selection parsing remains reliable when titles are edited.
- **Rate-limit identifier correctness:** `miro:update-image` now keys limits by Authorization bearer token instead of attempting to read a body token that no longer exists.
- **HTML entity decode for frame names:** Names containing HTML entities (e.g. `Expanded&#61;True`) now display correctly as their actual characters (`Expanded=True`). Created `src/lib/decodeHtmlEntities.ts` and applied at all name entry points — relay response (`companionRelayClient.ts`), Penpot selection/export (`usePenpotImporter.ts`), Figma REST API and companion selection (`useFigmaImporter.ts`), sync name cache (`useMiroSync.ts`), and display components (`SyncTab.tsx`, `ImportTab.tsx`).

### Added
- **Pairing ID masking with eye toggle:** All three Pairing ID fields (Miro plugin Settings, Figma companion, Penpot companion) now default to hidden (`type="password"`, shown as `********`) with an eye icon button to reveal. Protects against screen recording and shoulder surfing.
- **Pairing ID rotation:** Added `REGENERATE` button in Miro plugin Settings that generates a new random `sb_xxx` ID via `rotatePairingId()` in `src/lib/pairingId.ts`, overwriting the stored value. Existing companion connections will need the new ID.
- **Documentation of rate limits, batch limit, and scale cap:** Added default rate limit table (9 endpoints with env variable names), batch size limit (3 unique images), and community scale cap (1x/2x) to `doc/faq.md` and `doc/architecture.md`.

### Changed
- **Miro plugin panel decomposition:** Split `src/app/miro-plugin/page.tsx` monolith into focused components (`AppHeader`, `TabNav`, `SyncTab`, `ImportTab`, `SettingsTab`, `BoardStatusFooter`, shared types), reducing `page.tsx` from ~970 lines to ~319 lines.
- **Selection grouping performance:** Replaced repeated `getGroupedItems()` render calls with memoized grouped state.
- **Pairing ID source of truth:** Moved pairing ID generation into `src/lib/pairingId.ts` and reused it across panel + relay client, fixing the empty-string localStorage edge case.
- **Analytics deduplication:** Consolidated duplicated `trackEvent` implementations into `src/lib/analytics.ts`.
- **Removed dead verify route:** Deleted unused `/api/figma/verify` endpoint.
- **Removed production debug noise:** Cleared `console.log` debug traces from `public/penpot-companion-plugin.js`.

## [0.13.1] - 2026-07-25

### Fixed
- **Removed `/api/figma/verify` startup check:** Figma's `/v1/me` endpoint does not accept OAuth tokens — only Personal Access Tokens. So the verify endpoint returned 401 for every valid OAuth token, and the plugin cleared the Figma connection on every reload. Removed the verify call entirely. Server-side token revocation is now detected at sync time (when a Figma API call returns 401, the sync error handler surfaces it).
- **Token storage read failures on iframe reload:** `saveToken()` only wrote to Miro board storage (server-side, slow on fresh load) and returned early, never reaching `localStorage`. On iframe reload (Miro tab reopen or idle resume), `getToken()` tried board storage with a 1500ms timeout; if that failed before Miro's SDK synced board data, the fallback to `localStorage` found nothing and returned `null`. Fixed by always writing to `localStorage` alongside board storage, and reading from `localStorage` first (instant, no network). Board storage remains as a backup for when browser cache is cleared.

### Changed
- **Batch limit counts unique exports, not total widgets:** The batch limit of 3 now applies to unique `(fileKey, nodeId, format, scale, platform)` groups — i.e., distinct Figma/Penpot exports. Widget copies of the same frame share the render cache and are NOT counted against the limit. When `syncAllCopies` is enabled, all copies of the first 3 frames sync without consuming extra export slots. The sync function no longer silently truncates; if called with >3 unique groups it throws an error (defense-in-depth, since the UI already blocks the button).

### Changed
- **Community plan scale limit (1x, 2x only):** The scale selector now limits options to 1x and 2x for the Community plan (self-host deployments keep 1x–4x). This caps the worst-case export count at 3 frames × 2 scales = 6 renders per sync, protecting free-tier infrastructure (Ably 200k msg/mo, Upstash 10k cmd/day) from accidental overuse.
- **Rate limit defaults bumped:** `RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN` 5→12, `RATE_LIMIT_COMMUNITY_UPDATE_IMAGE_PER_MIN` 10→30. Community users can now run 2 full batches per minute (6 renders + copy updates).
- **Propagate now unchecks Preserve Size:** When "Propagate format & scale to all copies" is checked, "Preserve widget size" is automatically unchecked — prevents 1x image in a 4x box (pixelated).

### Added
- **Version injection via generated file:** Changed `src/lib/version.ts` from `require('../../package.json')` (subject to bundler caching) to importing from `src/lib/version.generated.ts` — a file written by `scripts/inject-version.mjs` with hardcoded strings. The inject script now runs before `yarn dev` as well as `yarn build`, ensuring the displayed version always matches `package.json` regardless of Turbopack/Webpack caching.

## [0.13.0] - 2026-07-24

### Added
- **Batch limit of 3:** Sync now limits to 3 items per operation. The UI shows a warning banner and disables the Sync button when more than 3 items are selected, preventing silent truncation mid-process.
- **`penpot.openPage()` preload for cross-page exports:** When exporting a Penpot shape from a different page, the companion plugin navigates to that page before export via `await penpot.openPage(page)`. This preloads the shape data into WASM memory, reducing the export freeze from 10-60s to ~1-3s (navigation flicker instead of main-thread freeze). The companion does not navigate back.
- **Sequential Penpot batch processing:** Changed from `Promise.all` (concurrent) to `for...of` (sequential) to allow each export to benefit from the previous `openPage` navigation when shapes share the same page.
- **UI card stack height:** Increased from 300px to 360px so 3 cards fit without scrolling.

### Changed
- **Penpot `findShapeById` — Official API:** Replaced the manual recursive tree walk with Penpot's official `page.getShapeById(shapeId)` API (O(1) internal map lookup by UUID) for both current-page and cross-page shape search. The tree walk is kept as a fallback for older Penpot instances. The new path is faster and more robust.

### Documentation
- **Penpot Export Freeze Root Cause:** Documented the actual freeze mechanism — Penpot's WASM `_render_shape_pixels` loads other page's shape tree into linear memory synchronously. `penpot.currentPage` is read-only from the plugin API, preventing page preloading. Both WASM (PNG) and server (SVG) paths freeze for off-page shapes.
- **`penpot.openPage()` workaround:** Documented the `openPage` navigation preload as a mitigation for the freeze (fast page switch instead of frozen UI).
- **Batch limit rationale:** Batch limited to 3 items due to Miro API rate limits, relay round-trip latency, and WASM page-load overhead per unique page.

## [0.12.0] - 2026-07-24

### Fixed
- **"Place on Canvas" & "Replace Selected" Status Feedback:** Both features now properly use the color-coded status bar. Success messages have `✓` prefix (green success), and progress messages are shown during the render/export phase before the image is placed or replaced. Figma and Penpot import flows both report "Rendering Figma frame..." / "Exporting Penpot frame..." while the server generates the image.
- **Penpot Cross-Page Shape Search:** `findShapeById` in `public/penpot-companion-plugin.js` now falls back to searching all pages (`penpot.pages`) when a shape is not found on the current page. Previously, syncing a Penpot image only worked if the original frame was on the page currently open in Penpot — shapes on other pages caused a hard sync failure. Also fixed a latent bug where `findShapeById` was called without `await` in the export-shape handler.
- **Penpot Export Timeout:** Increased relay timeout for `export_shape` from 18s to 120s in `companionRelayClient.ts`. Some complex Penpot shapes take up to 66s to export — the previous 30s window was still too tight.
- **Companion Plugin Logging:** Added `[SyncingBoard]` console logs to `findShapeById` and `exportShapeBuffer` to distinguish which search path succeeds (selection, current page, cross-page, or `penpot.export` fallback) and how `penpot.pages` behaves.
- **Documentation:** Added Penpot export performance characteristics to `doc/architecture.md` (selection fastest → same page → other page slowest). Removed session-level render cache to prevent stale image data on re-sync.

### Documentation

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
- **"Replace Selected" — Adopt Any Image into SyncingBoard:** New button in Import tab that replaces a manually-pasted or third-party image widget with a SyncingBoard-managed copy, keeping the widget ID intact to preserve connectors, comments, links, and frame membership.
  - "Replace selected" button below each Import button (Figma/Penpot), enabled when a frame is selected.
  - Reads the current Miro board selection and adopts any image-type widgets.
  - Attaches `syncingboard` metadata (adoption) or updates it (re-targeting to a different frame).
  - Then renders and pushes the new image via the standard sync API.
  - Non-SyncingBoard images become recognised copies; existing SyncingBoard widgets can be re-targeted to a different frame.
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
  - Added a configuration panel in the local plugin UI so self-hosts can easily point the companion to their own deployed SyncingBoard domain URL.
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
- **CORS Origin Whitelisting:** Configured Tauri's local Axum bridge server to validate CORS `Origin` headers against a whitelist of trusted domains (`https://syncingboard.com`, `http://localhost:3000`, `http://localhost:1420`).
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
- **Token Fingerprinting:** Token storage keys now include a `deploymentFingerprint()` hash of `window.location.origin` to prevent collisions across SyncingBoard deployments.
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
- **Tauri client support:** Configured `penpotMcpClient.ts` to connect to Tauri secure loopback `local-syncingboard.luiskobayashi.com` when the bridge toggle is active.
- **Figma Tauri support:** Enabled local Figma selection detection through the Tauri proxy inside `useFigmaImporter.ts`.
- **Sidebar settings toggle:** Added a Connect/Disconnect widget in the settings tab for "SyncBridge" along with a pairing ID generator and clipboard copy utility.

### Removed
- **Penpot MCP Server Client:** Deleted all redundant Penpot MCP server connection code from `penpotMcpClient.ts`, transitioning exclusively to the Tauri secure loopback bridge.

## [0.1.10] - 2026-07-10

### Added
- **Penpot Sync Integration:** Added support for syncing Penpot frames to the Miro canvas side-by-side with Figma.
- **Penpot MCP Client Integration:** Created `penpotMcpClient.ts` communicating with the local Penpot MCP server over HTTP JSON-RPC POST requests to prevent SSE timeout locks.
- **Penpot Client Importer:** Built `usePenpotImporter.ts` validating frame URLs, detecting selection frames, and placing SVGs on the canvas.
- **Miro Update API Platform Handling:** Updated `/api/miro/update-image` to support and output platform-specific title tags (`PenpotSync` vs. `SyncingBoard`).
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
- **Name-First Title Format:** Changed the image title structure to show the clean human-readable design name first, followed by the sync metadata (`Name [SyncingBoard|fileKey|nodeId]`). Adapted selection hook parsing, fallback generation, and copy-matching logic accordingly.

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
- **SyncingBoard Custom Logo:** Integrated `public/syncingboard_logo.svg` as the application's favicon and main sidebar logo, styled with dynamic CSS mask-image logic.
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
- **Vercel Deploy Destination:** Updated the target destination repository URL in the "Deploy with Vercel" markdown button to point to the active `luismichio/syncingboard` repository.
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
