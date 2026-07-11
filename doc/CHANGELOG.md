# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.2] - 2026-07-11

### Changed
* **Clean Platform Badges:** Replaced dark background colored badges in the Sync tab selection cards with transparent background, outline-only badges styled in each platform's accent color (neon green for Figma, purple for Penpot).

### Removed
* **Redundant Penpot Card:** Completely removed the redundant disabled "Penpot Syncing - INACTIVE" card from the Settings panel when SyncBridge is disconnected. All local workspace pairing states are now cleanly represented by the SyncBridge card itself.

## [0.2.1] - 2026-07-11

### Changed
* **SyncBridge Rebranding:** Renamed all occurrences of "Tauri Desktop Bridge" to "SyncBridge" across the codebase, user interface, error messages, and documentation.
* **SyncBridge UI Alignment:** Aligned the SyncBridge connection card in the Settings panel to match the Connect/Disconnect pattern of Figma and Miro (replacing the toggle checkbox).

### Fixed
* **Tokio Runtime Panic:** Switched background server thread initialization from `tokio::spawn` to `tauri::async_runtime::spawn` to resolve the "there is no reactor running" startup panic in the compiled binary.
* **Penpot Selection Pointers:** Cleaned up outdated selection error tip reminders inside `usePenpotImporter.ts`.

## [0.2.0] - 2026-07-11

### Added
* **Tauri Desktop App Workspace:** Initialized standard Tauri v2 application inside `/tauri-bridge` using Yarn and Vanilla TypeScript template.
* **Axum Local Secure Server:** Implemented Axum HTTPS local web server on port `4401` using rustls-tls to route selection detection and exports.
* **WebSocket Pairing Router:** Setup a thread-safe connection mapping WebSocket upgrade path in Axum to pair and relay commands to/from active Penpot browser tabs.
* **Figma desktop relay:** Structured automatic local HTTP selection query forwarding to Figma desktop's MCP instance on port `3845`.
* **Automated CI/CD Release Pipeline:** Created `.github/workflows/release-tauri.yml` which automatically compiles `.msi`, `.exe`, `.dmg`, `.app`, and `.deb` installers using GitHub actions upon tagging releases.
* **Bridge Documentation:** Added `doc/tauri-setup.md` detailing prerequisites, Let's Encrypt certificates installation, and GitHub Action releases.

## [0.1.11] - 2026-07-11

### Added
* **Tauri HTTPS Bridge & Penpot Companion Plugin Schema:** Created the system specifications and architecture design for the loopback bridge.
* **Penpot Companion Plugin:** Created `penpot-companion-plugin.html` script which connects the Penpot editor tab directly to the Tauri proxy over WebSockets.
* **Tauri client support:** Configured `penpotMcpClient.ts` to connect to Tauri secure loopback `local.syncboard.com` when the bridge toggle is active.
* **Figma Tauri support:** Enabled local Figma selection detection through the Tauri proxy inside `useFigmaImporter.ts`.
* **Sidebar settings toggle:** Added a Connect/Disconnect widget in the settings tab for "SyncBridge" along with a pairing ID generator and clipboard copy utility.

### Removed
* **Penpot MCP Server Client:** Deleted all redundant Penpot MCP server connection code from `penpotMcpClient.ts`, transitioning exclusively to the Tauri secure loopback bridge.

## [0.1.10] - 2026-07-10

### Added
* **Penpot Sync Integration:** Added support for syncing Penpot frames to the Miro canvas side-by-side with Figma.
* **Penpot Link Parser:** Implemented design workspace URL parser matching workspace formats (`design.penpot.app/#/workspace/...`) with 100% test coverage.
* **Penpot MCP Client Integration:** Created `penpotMcpClient.ts` communicating with the local Penpot MCP server over HTTP JSON-RPC POST requests to prevent SSE timeout locks.
* **Penpot Client Importer:** Built `usePenpotImporter.ts` validating frame URLs, detecting selection frames, and placing SVGs on the canvas.
* **Miro Update API Platform Handling:** Updated `/api/miro/update-image` to support and output platform-specific title tags (`PenpotSync` vs. `SyncBoard`).
* **Consolidated Selection UI:** Grouped duplicate canvas screens in the sidebar under a single frame card, rendering a copy counter badge (e.g. `x3`) in the top-right and batch-applying format/scale changes to all selected copies.
* **CORS Support for Penpot MCP:** Patched the local Penpot MCP server code (`PenpotMcpServer.ts`) to support cross-origin requests, enabling browser-based plugin communication.

## [0.1.9] - 2026-07-10

### Added
* **SVG Vector Support:** Integrated vector format rendering, enabling users to sync screens as SVGs on the Miro board for infinite zoom crispness.
* **Per-Image Formatting & Scaling:** Added interactive Format (PNG/SVG) and Scale (1x, 2x, 3x, 4x) controls in the Sync sidebar panel for each selected image widget, dynamically stored inside Miro's metadata.
* **Preferences Panel:** Added a global "Default PNG Scale" configuration dropdown inside the settings tab to set the default scale for newly imported images.
* **Mixed Batch Grouping:** Upgraded the rendering engine to group requests by fileKey + format + scale, keeping mixed sync selections batched and optimized.

## [0.1.8] - 2026-07-10

### Added
* **Vitest Unit Test Suite:** Configured Vitest and jsdom environments for frontend testing. Added test coverage for Figma URL parsing and OAuth token validation helpers.
* **Husky Pre-Push Hook:** Added automated pre-push hook integration ensuring lint, test, and production builds pass before any git push.
* **Themed Auth Popups:** Integrated a dynamic, client-side script in all OAuth auth and callback popup windows to detect the active theme configuration (`light`, `dark`, or `system` pref) from localStorage and dynamically style background, text, buttons, and loading states to match.
* **Name-First Title Format:** Changed the image title structure to show the clean human-readable design name first, followed by the sync metadata (`Name [SyncBoard|fileKey|nodeId]`). Adapted selection hook parsing, fallback generation, and copy-matching logic accordingly.

### Fixed
* **OAuth CSRF Security:** Implemented cryptographic random `state` validation via secure, HTTP-only cookie validation for Figma and Miro callback routes.
* **Safe Token Serialization:** Transitioned from unsafe string template literals to robust `JSON.stringify` serialization on authorization success callback frames to prevent script crash and potential injection.
* **Verbose Console Logs Cleanups:** Removed development debugging logs from `useMiroSelection.ts` to follow production standards.

---

## [0.1.7] - 2026-07-09

### Fixed
* **Iframe Token Write Missing:** Fixed the core token persistence bug by updating the `postMessage` and `BroadcastChannel` event handlers inside `useAuthTokens.ts` to explicitly call `saveToken()` when receiving successful authentication results from the OAuth popups. This ensures credentials are saved to Miro's board storage right away instead of only existing in temporary component memory.

---

## [0.1.6] - 2026-07-09

### Added
* **SyncBoard Custom Logo:** Integrated `public/syncboard_logo.svg` as the application's favicon and main sidebar logo, styled with dynamic CSS mask-image logic.
* **Offline Font Optimization:** Replaced external Google Font loads with standard system font fallback stacks, preventing Next.js Turbopack compilation crashes in offline or restricted-network environments.

---

## [0.1.5] - 2026-07-09

### Added
* **Dynamic Public SVG Masks:** Migrated connection status indicators to use `/Figma.svg` and `/Miro.svg` assets from the public directory. Applied CSS `mask-image` in `page.tsx` to colorize them into monochrome theme states (muted gray when disconnected, neon green/purple accent when connected).

### Fixed
* **Miro Storage Typings Parity:** Reverted `lib/tokens.ts` to use direct `storage.get` and `storage.set` API parameters, resolving TypeScript compilation errors while keeping the initialization poll delay intact to guarantee token persistence on reload.

---

## [0.1.4] - 2026-07-09

### Added
* **Connection Status Indicators:** Added Figma and Miro status icons to the top-right corner of the App Header. The SVGs remain light gray (`text-text-muted/20`) when disconnected and light up in active green/purple (`text-accent`) when authorized.

### Fixed
* **Token Persistence on Refresh:** Fixed a race condition where tokens failed to load on page reload. `useAuthTokens` now polls and waits for `window.miro.board` initialization before querying board storage, preventing default browser third-party `localStorage` blocks inside the Miro iframe environment.

---

## [0.1.3] - 2026-07-09

### Fixed
* **Theme Hydration Cascading Renders:** Wrapped theme loading state setter inside `requestAnimationFrame` to defer updates to the next microtask, preventing Next.js hydration warning loops.
* **Access Before Declaration:** Moved local declaration blocks in `ThemeToggle.tsx` above usage patterns.
* **Unused Variable Warnings:** Removed unused imports (`useEffect`, `TokenData`), unused error parameters in try-catch statements, and unused Request signatures in Next.js OAuth API route handlers.

---

## [0.1.2] - 2026-07-09

### Added
* **Vercel Serverless Configurations:** Created `vercel.json` to extend the serverless function execution timeout `maxDuration` to 60 seconds (applicable for Pro/Enterprise) to support heavy asset downloads.

### Changed
* **Vercel Deploy Destination:** Updated the target destination repository URL in the "Deploy with Vercel" markdown button to point to the active `luismichio/syncboard` repository.
* **Rate Limits Documentation:** Expanded the `README.md` to detail both Figma and Miro rate limits, highlighting plan limitations (Starter vs. Pro) and the built-in Miro request throttle delay.

---

## [0.1.1] - 2026-07-09

### Added
* **Render Batching API:** Added `/api/figma/render-batch` serverless route accepting multiple node IDs to render and download assets in a single Figma API request, minimizing quota usage.
* **Miro Sync Copy Option:** Added a toggle checkbox "Also update all board copies" to the Sync tab.
* **Enriched 429 Error Fields:** Extracted Figma-specific rate limiting headers (`X-Figma-Plan-Tier`, `X-Figma-Rate-Limit-Type`, `Retry-After`) and bubble them up to the UI status message.

### Changed
* **Default Sync Scope:** Refactored `useMiroSync` to update only the selected board items by default (rather than scanning the entire board for copies).
* **Deduplicated Rendering:** Sync now fetches Figma renders exactly once per unique node ID and distributes the data url to all Miro matching widgets, reducing redundant API hits to 0 for duplicated widgets.
* **Error Handling:** Client-side error messages now present structured details showing Plan Tiers, Seat Types, and dynamic cooldown counts.

---

## [0.1.0] - 2026-07-08

### Added
* **Tabbed Plugin Layout:** Rebuilt the sidebar UI in `src/app/miro-plugin/page.tsx` into an organized 3-tab layout (Sync Selection, Import Screen, Settings) to suit narrow plugin sidebar views.
* **Disconnect Actions:** Added UI buttons to disconnect Miro and Figma connections and flush tokens from localStorage/board storage.
* **Iframe Message Listener:** Implemented a `window.addEventListener('message')` listener inside `useAuthTokens.ts` to bypass standard BroadcastChannel partitioning issues during OAuth popup redirection.

### Fixed
* **Miro SDK v2 Promise Proxy Crash:** Resolved standard `SdkError: Cannot call method '.then()'` runtime errors by wrapping proxy board resolutions into static objects.
* **Lazy State Hydration:** Refactored the main coordinator state hooks in `useMiroPlugin.ts` to use functional lazy initializers, resolving React cascading rendering warnings.
* **TypeScript Strict Types:** Cleaned up code structure, replacing all standard `any` type overrides with strict type definitions.
