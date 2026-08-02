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
