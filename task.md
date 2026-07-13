# Task: Miro Connection Reliability + React Hydration #418

## Objective
Resolve unreliable connection status in Miro plugin (yellow forever / stale state) and eliminate React minified error #418 reported on plugin open.

## Phase 1 — Token bootstrap reliability (`src/app/miro-plugin/useAuthTokens.ts`)
1. Refactor boot loader to avoid indefinite loading state:
   - Keep `tokensLoading` as bootstrap status only.
   - Prevent overlapping retries with explicit retry timer tracking.
   - Ensure wait-for-Miro resolves exactly once and clears timers.
2. Edge cases:
   - Miro SDK partially initialized (`window.miro.board` present but storage API not callable).
   - OAuth callback arrives while bootstrap still running.
   - Popup closes before token store resolves.
3. Validation:
   - `tokensLoading` must transition to false on all boot outcomes.
   - No recurring forced yellow status loops after boot.

## Phase 2 — Storage/API hardening (`src/lib/tokens.ts`, `src/app/api/oauth/refresh/route.ts`)
1. Add runtime guards for Miro storage API callability (`get` / `set` function checks).
2. Add timeout wrappers for:
   - `board.storage.get` / `board.storage.set`
   - client `/api/oauth/refresh` fetch
   - server provider refresh fetches (Figma/Miro)
3. Fallback order:
   - Try Miro board storage if callable and responsive.
   - On failure/timeout, fallback to localStorage safely.
4. Validation:
   - No uncaught `.get()` / `.then()` SDK method execution errors.

## Phase 3 — Hydration mismatch fix (`src/app/miro-plugin/useMiroPlugin.ts`, `src/app/miro-plugin/page.tsx`)
1. Remove client-only lazy initializers from render-time state:
   - `window.location.search`
   - `localStorage` reads
   - `Math.random()` pairing id generation
2. Move initialization into `useEffect` after mount with deterministic initial SSR values.
3. Validation:
   - No React minified #418 hydration mismatch on plugin open.

## Phase 4 — Documentation + verification
1. Update changelog under testing phase (`0.1.x`) in `doc/CHANGELOG.md`.
2. Run `yarn build` and ensure TypeScript passes.
3. Summarize root causes + fixes + residual risks.

## Status
- [x] Phase 1 implemented
- [x] Phase 2 implemented
- [x] Phase 3 implemented
- [x] Changelog updated
- [x] Build verified
