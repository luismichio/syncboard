# Task: Sprint 1.5 — OAuth Preview Domain Portability Fix

## Phase 1 — Dynamic App URL Extraction
- [x] Refactor `redirectUri` generation in `src/app/api/oauth/figma/auth/route.ts` to compute the base host protocol dynamically from request headers.
- [x] Refactor `redirectUri` generation in `src/app/api/oauth/figma/callback/route.ts` similarly.
- [x] Refactor `redirectUri` generation in `src/app/api/oauth/miro/auth/route.ts` similarly.
- [x] Refactor `redirectUri` generation in `src/app/api/oauth/miro/callback/route.ts` similarly.

## Phase 2 — Verification
- [x] Verify that Next.js production build completes successfully (`yarn build`).
- [x] Verify that all unit tests pass (`yarn test`).

---
# Task: Sprint 1 — Security Hardening & Dead Code Cleanup

## Phase 1 — Secure ID & State Generation
- [x] Update `getOrCreatePairingId` in `src/app/miro-plugin/penpotMcpClient.ts` to generate a secure, 16-character base-36 alphanumeric pairing ID (e.g. `sb_` + 16 chars) using `window.crypto.getRandomValues()`.
- [x] Set `readOnly={true}` on the pairing ID input field in `src/app/miro-plugin/page.tsx` and verify that the user can still copy it but cannot enter custom/weak IDs.
- [x] Refactor OAuth `state` generation in `src/app/miro-plugin/useAuthTokens.ts` (`connectFigma` and `connectMiro` functions) to use cryptographically secure random values (via `window.crypto`) to mitigate CSRF risks.

## Phase 2 — Redis OAuth Store Integration (Synergy 1)
- [x] Export helper functions `storeOauthToken(state: string, tokens: unknown)` and `getOauthToken(state: string)` in `src/lib/relayRedis.ts` using `SETEX` with a 300s TTL (5 minutes) and automatic `DEL` on retrieval.
- [x] Refactor `src/app/api/oauth/store/route.ts` to use these Redis functions instead of the local in-memory global `Map`.

## Phase 3 — CORS & PNA Whitelisting in Tauri Bridge
- [x] Update the `add_cors_and_pna` middleware in `tauri-bridge/src-tauri/src/lib.rs` to validate the `Origin` request header.
- [x] Restrict CORS access strictly to `https://syncboard.luiskobayashi.com` and `http://localhost:3000`. Return `HTTP 403 Forbidden` for untrusted origins.

## Phase 4 — Dead Code & Orphan Cleanup
- [x] Delete Next.js orphan route folders:
  - `src/app/api/relay/penpot/poll/`
  - `src/app/api/relay/penpot/register/`
- [x] Delete temporary scratch files in the root folder:
  - `._temp_comp.html`
  - `_temp_section.txt`
- [x] Remove unused Redis helpers (`blockingDequeuePenpotCommand`, `markPenpotPresence`) and unused imports in `src/lib/relayRedis.ts`.
- [x] Clean up orphan endpoints and WebSocket handling inside the Tauri bridge server in `tauri-bridge/src-tauri/src/lib.rs`:
  - Remove `/ws` route, `ws_handler`, and `handle_socket`.
  - Remove `/penpot/poll` and `handle_penpot_poll`.
  - Remove `/penpot/register` and `handle_penpot_register`.
  - Remove `/penpot/result` and `handle_penpot_result`.
  - Remove `/detect-penpot` and `/export-penpot` routes/handlers.
  - Simplify `AppState` struct to remove unused fields (`penpot_commands`, `penpot_notify`).
  - Clean up client-side check `isTauriEnabled()` and redundant Tauri calls in `src/app/miro-plugin/penpotMcpClient.ts` to use only the cloud stack pathway.

## Phase 5 — Exception Sanitization
- [x] Sanitize API error responses in `src/app/api/oauth/refresh/route.ts` and `src/app/api/miro/update-image/route.ts` so they do not forward raw system exception messages back to the client.

## Phase 6 — Verification & Build Check
- [x] Run typescript compilation (`yarn build`) to verify that the build succeeds without error.
- [x] Run vitest unit tests (`yarn test`) to verify all tests pass.
