# Task: Implement Interactive Quick Start Section & Vercel Deploy Integration on `/docs`

## Phase 1: Planning & Component Design
- [x] Analyze `/docs` layout in `src/app/docs/DocsIndexClient.tsx`
- [x] Design `QuickStartSection.tsx` component with tabbed Community vs. Self-Hosted guides
- [x] Construct 1-click Vercel Deploy URL with required environment variable pre-population

## Phase 2: Implementation
- [x] Create `src/components/docs/QuickStartSection.tsx` with interactive tabs, direct Miro install URL, and Vercel Deploy button
- [x] Integrate `QuickStartSection` in `src/app/docs/DocsIndexClient.tsx` below hero search bar
- [x] Add Vercel Deploy button badge to `README.md` and `doc/setup.md`

## Phase 3: Verification & Changelog
- [x] Verify TypeScript types with `npx tsc --noEmit`
- [x] Document updates in `doc/CHANGELOG.md`

---

# Task: Reconcile Rate-Limit & Ghost-Connection Audit with Documentation

## Phase 1: Evidence Review
- [x] Compare `doc/dev/audit/audit_2026_08_01.md` with `README.md`, `doc/setup.md`, `doc/environment-variables.md`, and local-only `doc/backlog.md`.
- [x] Revalidate rate-limit windows, global-counter placement, OAuth token-exchange coverage, relay response ordering, and Ably lifecycle claims against source.

## Phase 2: Audit Revision
- [x] Correct endpoint count, production-verification scope, documented-versus-implemented quota claims, OAuth callback coverage, Miro fan-out, and async relay behavior.
- [x] Replace the invalid slow-export/Redis-TTL claim with the evidence-backed post-store 45-second delivery-window finding.
- [x] Record documentation sources and limitations in the audit verification record.

## Phase 3: Verification
- [x] Re-read the completed audit against source and documentation.
- [x] No application code, tests, build, changelog, commit, or backlog change required: this is a local-only audit-document correction.

## Phase 4: Community Free-Tier Capacity Extension
- [x] Add a capacity assessment based on the user-provided Ably Free 200-concurrent-connection constraint.
- [x] Separate connection admission from request-rate limiting; document transient Miro relay connections and a 40–50 session starting cap.
- [x] Add conservative Community quotas plus Upstash, Ably-message, Vercel-payload, and relay-result identity considerations.
- [x] Re-read the changed audit sections against the current source findings.

---

# Task: Community Rate Limits & Relay Connection Hardening

## Phase 1: Rate-Limit Contract
- [x] Align `src/lib/rate-limit.ts` defaults and activate documented Figma/relay multi-windows.
- [x] Scope the global sync backstop away from OAuth, Ably, node-info, and relay bookkeeping traffic.
- [x] Add refresh-token-hash rate limiting to `src/app/api/oauth/refresh/route.ts`.
- [x] Extend `src/lib/rate-limit.test.ts` for the changed contract.

## Phase 2: Client Connection Stability
- [x] Move Figma companion to authUrl renewal plus terminal-state recovery.
- [x] Add Miro relay-client terminal-state handling, idle close, and page lifecycle cleanup.

## Phase 3: Remaining Capacity Work
- [x] Implement a Redis sorted-set relay-session lease/admission system with a 30-minute TTL, 15-minute renewal, explicit idle/page-exit release, and a 40-session Community cap.
- [x] Bind relay result submissions to pairing identities and rate-limit by pairing rather than request ID.

## Phase 4: Client Cooldown UX, Documentation & Verification
- [x] Distinguish SyncingBoard 429 responses from Figma provider 429 responses and surface server retry/reset information.
- [x] Expose a live Community cooldown countdown and disable the Sync action while it is active.
- [x] Update public quota documentation and `doc/CHANGELOG.md`.
- [x] Run focused tests and `yarn build`.

## Phase 5: Remaining Ghost-Path Hygiene
- [x] Clear Penpot companion connection timeout and close its Ably presence on page exit.
- [x] Bound unanswered companion pending requests by selection/export timeout.
- [x] Extend relay result retention to 180 seconds and retry transient 404 retrievals before failing.
- [x] Retain Ably presence as the low-cost liveness signal; document the residual abrupt-crash detection window rather than adding an unaffordable high-frequency heartbeat.
- [x] Apply the same bounded pending-request hygiene to the Figma companion (selection requests now expire after 15 s; timers cleared on response).
- [x] Recover `public/figma-companion-ui.html` after a tooling corruption truncated it: reconstructed from `git HEAD` + the recorded Phase-2 transform script, verified line-identical to the pre-loss state, then re-applied the pending-request bounding.


## Phase 6: Audit Closure (0.14.1) — Remaining Findings
- [x] Wrap /api/oauth/figma/callback and /api/oauth/miro/callback with IP-keyed rate limiting (oauth:callback, 20/min) — closes the last unwrapped token-exchange path.
- [x] Add a dedicated relay export sub-budget (2/min + 20/day per pairing) via a skipWhen predicate; exports are counted against both the general relay budget and the export budget.
- [x] Honor Miro Retry-After (capped 10s) in update-image geometry backoff; surface retryAfter on upload 429s.
- [x] Slow OAuth popup polling 1.5s -> 4s (~75 polls/5-min attempt instead of ~200).
- [x] Add success-path X-RateLimit-Limit/Remaining/Reset headers for proactive client throttling.
- [x] Remove the ?token= query identifier from figma:render (Authorization-header-only).
- [x] Propagate Figma 401/403/429 in node-info instead of masking as { name: "Pasted Screen" }; 404 keeps the fallback.
- [x] node-info now shares a per-token daily window (50/day) alongside its per-minute limit.
- [x] Companions enter Ably presence with ready: true; relay server only treats ready members as online (presence != readiness). Abrupt-crash staleness (~2 min) stays a documented residual.
- [x] Remove unenforced RATE_LIMIT_COMMUNITY_GLOBAL_BANDWIDTH_MB_PER_DAY and RATE_LIMIT_COMMUNITY_MAX_COMPANION_PAIRS from code, .env.example, and docs.
- [x] Extend rate-limit.test.ts (5 new tests) and update doc/CHANGELOG.md under 0.14.1.
- [x] Verification: yarn test 85/85, yarn build clean, companion inline JS node --check clean.

---

# Task: 0.15.0 — Community Active Slot Counter & Graceful Queue UX (backlog §8)

## Scope
- Implement §8 under 0.15.0; NO paid upsell yet (desktop/Tauri hinted as the future queue-escape hatch)
- Target/source AGNOSTIC: Figma + Penpot → Miro today; FigJam + Mural must reuse the same pool

## Phase 1: Backend
- [x] relayRedis: generic renames (RelaySessionLease, relay:sessions key, acquireRelaySession/releaseRelaySession, RATE_LIMIT_COMMUNITY_MAX_RELAY_SESSIONS + legacy alias)
- [x] relayRedis: getRelaySessionStatus (ZCOUNT > now-TTL), deriveRelayStatusLevel (75% → high_load, ceiling → full), incrementGlobalSyncCount/getGlobalSyncCount (Lua INCR + 24h TTL)
- [x] relay/session + ably/token routes: renamed lease fns
- [x] NEW /api/relay/status GET route (withRateLimit relay:status 60/min per IP)
- [x] rate-limit.ts: relay:status endpoint limit + display-counter INCR alongside global backstop

## Phase 2: Frontend (Miro sidebar)
- [x] useRelayStatus hook (30s poll + manual refetch, in-flight guard)
- [x] RelayStatusBanner: green/amber/red states; manual "Check again" with 7s cooldown countdown; desktop hint (no paid plans)
- [x] SyncTab mounts banner
- [x] companionRelayClient: friendly relay_capacity_reached message

## Phase 3: Release
- [x] Tests: relayRedis.test.ts (deriveRelayStatusLevel boundaries) → 89/89
- [x] .env.example + environment-variables.md + setup.md: env rename w/ alias note
- [x] CHANGELOG 0.15.0 + bump-version 0.15.0 (pkg, tauri, cargo) + HTML badges
- [x] backlog §8 status marker
- [x] Verified: TS clean (all runs); full build green via `yarn build` (Turbopack)
- [ ] git commit + push (pending user validation)

---

# Task: 0.15.1 — 1-Board-Per-User & Session Transfer UX

## Scope
- Implement 1-board-per-user binding in Redis (`relay:user_board:{sha256_userId}`, 30-min TTL)
- Implement conflict detection & bidirectional `[ 🔄 Transfer Session to This Board ]` UX
- Fix Rust `/health` payload (C2) to report `figmaConnected` / `miroConnected`
- NO paid upsell — 100% Community capacity transparency

## Phase 1: Redis & Pure Logic (`src/lib/relayRedis.ts`)
- [x] Write detailed implementation plan to `doc/dev/plan/plan_2026_08_03_user_session_transfer.md` (rev. 2)
- [x] Implement `planAcquire` pure decision function (unit-testable outside Redis)
- [x] Implement thin Lua script for `heartbeat`, `release`, and `transfer` actions with 30-min TTL refresh
- [x] Add unit tests in `relayRedis.test.ts` for renew, conflict, full, and transfer logic

## Phase 2: API Routes
- [x] Update `/api/relay/session` route handler for `heartbeat`, `release`, and `transfer`
- [x] Update `/api/ably/token` to detect conflict at token issuance (`200 OK { conflict: true }`)
- [x] Update `/api/relay/status` to accept `?userIdHash=` and return user conflict state

## Phase 3: Frontend & Tauri Health (Miro Sidebar)
- [x] Update `companionRelayClient.ts` with `refreshRelayConnection()` (re-auth without calling `release`)
- [x] Update `useRelayStatus` to consume `userConflict` state
- [x] Update `RelayStatusBanner.tsx` to render `[ 🔄 Transfer Session to This Board ]` card on conflict
- [x] Add `⚡ Local Transport (0/40 slots used)` cyan badge when Tauri is active
- [x] Extend Rust `handle_health` in `tauri-bridge/src-tauri/src/lib.rs` (C2) to return `{ status, figmaConnected, miroConnected }`
- [x] Hook Tauri activation (`useTauri === true` AND `figmaConnected === true`) in `page.tsx` to release cloud Redis lease

## Phase 4: Documentation, Verification & Build
- [x] Update `README.md` Community Demo section with 40-slot ceiling and 1-click transfer callouts
- [x] Update `doc/architecture/infrastructure-and-costs.md` with 1-board-per-user rule
- [x] Update `doc/setup.md` with session transfer behavior and 30-min binding TTL
- [x] Run `yarn test` + `yarn build` (using Turbopack)
- [x] Document release notes in `doc/CHANGELOG.md`

---

# Task: 0.15.2 — Companion Session Fairness & Infra Rebalancing

## Scope
- Implement 180 companion token ceiling in `/api/ably/token` (20-WebSocket reserve for Miro)
- Implement orphan standby companion eviction logic + `{ event: 'companion_evicted' }` Ably broadcast
- Implement 1-tab-per-pairing companion binding (`relay:companion_session:{pairingId}`) & transfer UX
- Add `[ 🔄 Transfer Connection to This Tab ]` button to Figma & Penpot companion headers (`public/figma-companion-ui.html` & `public/penpot-companion-ui.html`)
- Implement R1–R5 Infra Rebalancing (R1 status poll optimization & EXPIRE dedupe cache, R2 Penpot inline SVG exports, R3 Lua EVAL rate-limit batching, R4 sync-poll loop removal, R5 client Ably token cache)

## Phase 1: Backend & Core Redis Logic
- [x] Implement 180 companion token cap & active-pair priority in `src/lib/relayRedis.ts` & `/api/ably/token`
- [x] Implement orphan standby companion eviction logic (`selectEvictionCandidate` pure fn)
- [x] Implement companion 1-tab-per-pairing binding & `/api/relay/companion/session` endpoint (`release` and `transfer`)
- [x] Implement client-side 2h Ably token cache (`src/lib/ablyTokenCache.ts` - R5)
- [x] Implement Penpot inline SVG exports over Ably (`src/lib/relayAbly.ts` - R2)
- [x] Implement Lua EVAL rate-limit check batching (`src/lib/rate-limit.ts` - R3)
- [x] Remove legacy 350ms sync-poll loop in `/api/relay/request/route.ts` (R4)
- [x] Add status count EXPIRE-cache deduplication in `/api/relay/status/route.ts` (R1)

## Phase 2: Companion Frontend UI
- [x] Handle `companion_evicted` and `companion_transferred` Ably events in `public/figma-companion-ui.html` & `public/penpot-companion-ui.html`
- [x] Add `[ 🔄 Transfer Connection to This Tab ]` card and button handler to Figma & Penpot companion UIs
- [x] Optimize `useRelayStatus.ts` to remove 30s blind polling intervals (R1)

## Phase 3: Verification & Release
- [x] Add unit tests for companion pure functions & `ablyTokenCache` in `src/lib/relayRedis.test.ts` & `src/lib/ablyTokenCache.test.ts` (13 test files, 106 tests passing)
- [x] Version bump to 0.15.2 in `package.json` & inject via `scripts/inject-version.mjs`
- [x] Update `doc/CHANGELOG.md` with 0.15.2 release notes
- [x] Run `yarn test` and `yarn build` (Turbopack) build verification

---
# Task: 0.15.3 — Dependabot Security Resolution & Node 20 Toolchain Pinning
## Scope
- Resolve 9 Dependabot security advisories in `next@16.2.10` by upgrading to `next@16.2.11` and `eslint-config-next@16.2.11`
- Pin Node 20 toolchain runtime (`.nvmrc` & `package.json` `engines`) to bypass Node 24 async-context `workStore` pre-render crash during Turbopack builds
- Validate full test suite (`yarn test`) and production pre-rendering (`yarn build`)
- Document release notes in `doc/changelog.md` under version `0.15.3`

## Phase 1: Toolchain Standardization & Node 20 Environment Lock
- [x] Create `.nvmrc` specifying `20.20.0`
- [x] Add `"engines": { "node": "^20.0.0" }` constraint to `package.json`
- [x] Verify version injection script (`scripts/inject-version.mjs`) compatibility

## Phase 2: Package Upgrade & Vulnerability Audit
- [x] Upgrade `next` and `eslint-config-next` to `16.2.11` in `package.json`
- [x] Run `yarn npm audit` to verify zero remaining security vulnerabilities

## Phase 3: Runtime & Build Verification
- [x] Run production build under Node 20 (`npx -y node@20 yarn build`) to verify clean Turbopack pre-rendering
- [x] Run test suite (`yarn test`) to verify zero unit test regressions (123 tests)
- [x] Test Node 24 build (`npx -y node@24 yarn build`) to record `workStore` upstream status in `doc/backlog.md`

## Phase 4: Documentation & Changelog
- [x] Add `[0.15.3]` release entry to `doc/changelog.md`
- [x] Update `task.md` task completion status
---
# Task: 0.16.x — Tauri SyncBridge Hardening (v0.16.x Planned)
## Scope
- Implement CORS & PNA Origin Whitelisting on bridge endpoints (`local.syncingboard.com:4401`)
- Implement Header-based Token Transmission (remove tokens from query params)
- Enable FigJam desktop path over bridge (`figma-plugin/manifest.json` domain check)
---
# Task: FigJam Phase 0 — Validation Spike (kickoff 2026-08-07)
## Goal
Validate the blocking unknowns from `doc/dev/plan/plan_2026_08_03_figjam.md` §4 (Phase 0 checklist) before Phase 1 (manifest + code branch). Outcome sets Phase 1 scope (no api bump; add `figjam` to editorType; networkAccess unchanged for v1 cloud-tier).

**Confirmed product goal (2026-08-07):** FigJam is a first-class **target equivalent to Miro** — everything Miro does, FigJam does; Figma↔Miro mirrors Figma↔FigJam, adjusting only for FigJam platform deltas.

**Pairing model (confirmed from code):** the **target owns/generates its pairing** (`src/lib/pairingId.ts` `getOrCreatePairingId()` — used by the Miro plugin/`page.tsx`/`companionRelayClient`/importers). The source companion (Figma/Penpot) joins the target's `sb_` key. So the **FigJam(target) ALSO generates its own pairid** via `getOrCreatePairingId()` — the Figma companion joins it. No new protocol; faithful mirror of Miro.

## Architecture decision (2026-08-07): shared target layer (modular, mirrored UI)
Accepted: build a **target-agnostic core + thin `TargetAdapter` seam + shared UI components**, so Miro / FigJam / future (Mural, Whiteboard, Excalidraw, tldraw) mirror "as much as possible." Phased, backwards-compatible:
- **(1a) Domain extraction:** pull the target-agnostic machinery out of Miro into pure/testable modules (`relay session subscribe/pull`, `sync-job state machine` → idle/Loading/Completed/429-cooldown, `pairing ownership`, feature model = skip/lock, deselect, geometry, GIF). NO behavior change; Miro tests stay green.
- **(1b) `TargetAdapter` seam:** thin interface (`createSelection`, `createOrUpdate(image hash)`, `skipGuard/locked`, `geometry`, `status`). Domain never touches an SDK directly.
- **(1c) FigJam adapter:** build Phase 1 **on top of the extracted core** — FigJam becomes the first validator of the seam (in-place `createImageAsync`→`Rectangle` IMAGE-fill swap).
- **(later) Miro UI onto shared components** for literal UI mirror.
## Phase 0 re-validation (live Figma docs, 2026-08-07)
- [x] `figma.editorType` / manifest `api` — manifest reference canonical example: `"api": "1.0.0"` with `"editorType": ["figma","figjam"]` and `"documentAccess": "dynamic-page"` → **NO bump; Phase 1 = add `"figjam"` only**
- [x] FigJam-gated APIs (current docs): `createSticky()`, `createShapeWithText()`, `createConnector()`, `createCodeBlock()`, `createGif()`, `createTable(numRows,numColumns)`, `figma.timer` — gated on `editorType` incl. `figjam`
- [x] `createImageAsync` / IMAGE fills NOT gated → available in FigJam with the shared plugin
- [x] FigJam node model: create+modify = Sticky/ShapeWithText/Connector/CodeBlock/Media/Table; modify-only = BooleanOperation/Stamp/Widget; Figma types (Rectangle/Text/Line/Vector/Polygon/Star/Slice) creatable via plugin API inside FigJam
- [x] Styles read-only in FigJam; no `createComponent`/`combineAsVariants` (matches plan §2.2)
- [ ] Runtime checks (manual; needs a FigJam file + dev-mode plugin): `dynamic-page` behavior in FigJam, permissions/view-edit, in-place imageHash swap
- [ ] FigJam pairing/relay smoke test (dev: pairing key → relay subscribe → payload fetch)
## Note — Community Tauri bridge domain (DEFERRED, NOT a Phase-0 blocker)
- `protokoba.com` = personal dev domain only (not public/community)
- Community bridge still desired — revisit LATER; Phase 0/1 proceed cloud-tier-only (Ably + Upstash; >4.5 MB chunked via relayRedis, no bridge dependency for v1 free tier)
- Dev bridge testing may use local protokoba tunnel domain

## FigJam Mirror UI (v1) - Milestones (2026-08-07)
M1 (this slice): Plugin figjam-mode command bridge in `figma-plugin/code.js` (place/update/adopt image via `createImageAsync`+IMAGE fill + `setPluginData` tracking, in-page dedup by nodeKey) + `ui.html` FigJam mode loads a hosted mirror page + new `public/figjam-companion-ui.html` (pairing display, status, selection, import-a-Figma-link -> render-batch -> place on FigJam board). Mirrors Miro import.
  Runtime check: in a real FigJam file, import a Figma frame/link -> Rectangle with IMAGE fill appears; re-import -> same node swaps imageHash (no new node); selection lists it.
M2: Destination relay pull - subscribe to the `figma:<pairing>` channel, apply each pushed frame (reuse companionRelayClient + relay routes; the Figma companion already publishes there for Miro).
M3: FigJam-side polish - status pill (Syncing/Completed/429), deselect/skip, group settings.
Cloud-tier v1 scope: Figma->FigJam image snapshot, in-place, no dupes (plan_2026_08_03_figjam.md).

STATUS: M1 committed (8491e24); M2 mirrored panel committed (944d91f) - /figjam-plugin reuses the
Miro components (AppHeader/TabNav/Sync/Import/Settings + BoardStatusFooter) via useFigJamKey over the
postMessage bridge. Local build blocked by the env workStore flake; CI authoritative.
Remaining: real relay-pull (companion pushes -> application) + real FigJam runtime pass.
