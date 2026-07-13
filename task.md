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

---

# Hotfix: Miro OAuth Connects but Stays Gray

## Root cause
Miro callback payloads could omit `refreshToken`; strict guards in `useAuthTokens.ts` rejected these payloads entirely, so `setMiroToken(...)` never ran even after successful OAuth popup completion.

## Applied fix
- Normalized callback/poll token payloads in `useAuthTokens.ts` (accept valid `accessToken`, default missing `refreshToken`/`expiresAt`).
- Normalized Miro callback token serialization in `src/app/api/oauth/miro/callback/route.ts` to always output string fields.
- Relaxed token parsing in `src/lib/tokens.ts` to accept missing `refreshToken` and continue using access token until real expiry.

## Verification
- [x] `yarn test --run`
- [x] `yarn build`

---

# Hotfix: Penpot Relay Export + Theme Sync

## Root cause
1. Companion plugin called deprecated/unsupported runtime method `penpot.export(...)`.
2. Theme sync depended on a one-shot delayed message and could race iframe readiness.

## Applied fix
- Switched export path to `shape.export({ type, scale })` using `penpot.currentPage.getShapeById(shapeId)` with old-runtime fallback.
- Added `ui-ready` handshake between companion UI and plugin runtime.
- Normalized theme values and added startup fallback apply (`os`) in UI.

## Verification
- [ ] Manual Penpot import smoke test in production
- [x] `yarn test --run`
- [x] `yarn build`

---

# Optimization: Penpot Relay Long-Poll + Quota Reduction

## Goal
Cut idle relay command usage while preserving fast command pickup for burst imports from Miro.

## Changes
- `src/lib/relayRedis.ts`
  - Added blocking queue read via `BRPOP` (`blockingDequeuePenpotCommand`).
- `src/app/api/relay/penpot/poll/route.ts`
  - Migrated poll endpoint to long-poll mode (45s window) using blocking dequeue.
- `public/penpot-companion-ui.html`
  - Replaced 2s spin polling with continuous long-poll reconnect loop.
  - Added single-session guard (`pollingSession`) to prevent overlapping poll loops.
  - Added periodic heartbeat registration (60s) instead of per-poll presence writes.

## Expected impact
- Lower idle Redis command usage.
- Near-real-time command pickup under burst command sequences.
- Fewer duplicate reconnect loops in transient network failures.

## Verification
- [ ] Manual burst import test (3–5 imports quickly)
- [ ] Confirm Upstash command-rate drop in idle mode
