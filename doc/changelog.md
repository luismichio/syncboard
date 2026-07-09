# Changelog

All notable changes to the SyncBoard project are documented in this file.

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
