---
title: Security, Rate Limits & Quotas Architecture
description: Sliding-window rate limiting, SHA-256 token hashing, 300s Redis SETEX OAuth state store, and CORS/PNA preflights.
---

# Security, Rate Limits & Quotas Architecture

> **Status:** stable — implemented throttles and security controls.

SyncingBoard includes built-in security mechanisms and rate limit throttles to comply with Figma and Miro API restrictions while protecting public demo infrastructure.

---

## Rate Limiting Engine & Token-Hash Keys

SyncingBoard implements a sliding-window rate limiter (`@upstash/ratelimit` via `src/lib/rate-limit.ts`) and global IP edge throttle (`src/middleware.ts`).

* **Token-Hash Identification (IP-Proof):** Callers are identified primarily by SHA-256 hashes of their OAuth tokens (`tok:sha256(token)`) or pairing IDs (`relay:sha256(pairingId)`). This prevents VPN/IP cycling attacks, as each request requires a valid user-authenticated token. Client IP (`ip:clientIp`) is used as a fallback only when no token or pairing ID is present.
* **Backend Auto-Detection:** Uses Upstash Redis when `UPSTASH_REDIS_REST_URL` is configured (required for Vercel serverless). On persistent infrastructure (Docker/VPS/ECS), falls back to an in-memory sliding window `Map`.

### Rate Limit Configuration Matrix

| Endpoint | Community Default | Env Variable |
|---|---|---|
| Figma renders / min | 5 | `RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN` |
| Figma renders / day | 50 | `RATE_LIMIT_COMMUNITY_FIGMA_PER_DAY` |
| Relay selections / min | 5 | `RATE_LIMIT_COMMUNITY_RELAY_PER_MIN` |
| Relay selections / hour | 30 | `RATE_LIMIT_COMMUNITY_RELAY_PER_HOUR` |
| Relay results / day | 100 | `RATE_LIMIT_COMMUNITY_RELAY_PER_DAY` |
| Miro image updates / min | 10 | `RATE_LIMIT_COMMUNITY_UPDATE_IMAGE_PER_MIN` |
| Ably token requests / min | 5 | `RATE_LIMIT_COMMUNITY_ABLY_TOKEN_PER_MIN` |
| Global syncs / day | 500 | `RATE_LIMIT_COMMUNITY_GLOBAL_SYNCS_PER_DAY` |

---

## Platform API Quotas & Optimizations

* **Figma API Quotas:** Starter (Free) plan is limited to 6 image requests per month. Paid plans allow 10–20 requests/min. For detailed tier limits, see the official [Figma REST API Rate Limits Documentation](https://developers.figma.com/docs/rest-api/rate-limits/). SyncingBoard optimizes consumption by batching requested frames from the same file into single HTTP requests (`/api/figma/render-batch`).
* **Penpot API Quotas:** Penpot does not enforce API rate limits or monthly export caps. Rendering runs locally in the Penpot browser tab.
* **Miro API Quotas:** Miro limits image updates (`PATCH`) to 50 requests/min per user token. For detailed rate tier specifications, see the official [Miro REST API Rate Limiting Reference](https://developers.miro.com/reference/rate-limiting). SyncingBoard enforces a **500ms delay** between consecutive widget updates to ensure compliance.
* **Batch Limit:** Community plan limits sync to **3 unique images per batch**. UI warning banner in `SyncTab.tsx` disables the sync button when exceeded.
* **Scale Restriction:** Community plan scale dropdown is limited to 1x and 2x (`MAX_SCALE=2`). Self-host deployments support 1x–4x (`MAX_SCALE=4`).

### Infrastructure & Cloud Provider Quotas

* **Vercel Serverless Limits:**
  * **4.5 MB Response Payload Limit:** Vercel serverless functions enforce a 4.5MB HTTP response body cap. Images exceeding 4.5MB require the Tauri extender or non-serverless hosting (AWS, Railway, Render).
  * **60s Execution Timeout:** Configured via `vercel.json` (`maxDuration: 60`).
  * See official [Vercel Serverless Function Limits](https://vercel.com/docs/functions/serverless-functions/runtimes#max-duration).

* **Upstash Redis Limits:**
  * **Free Tier Ceiling:** 10,000 commands/day and 256MB memory.
  * **Buffer Expiration:** Penpot binary image buffers in Redis enforce a strict **300s (5-minute) TTL** (`SETEX`) to prevent storage exhaustion.
  * See official [Upstash Redis Limits Documentation](https://upstash.com/docs/redis/features/limits).

* **Ably Realtime Limits:**
  * **Free Tier Ceiling:** 6,000,000 messages/month and 200 concurrent WebSocket connections.
  * **Message Rate:** Max 150 messages/second. Signal payloads are minimized to light JSON commands (`render-frame`).
  * See official [Ably Limits & Quotas Reference](https://ably.com/docs/pricing/limits).

---

## Security Architecture & Handshake Controls

### Stateless OAuth Store (`/api/oauth/store`)
Opening Miro or Figma OAuth login pages inside iframe sandboxes triggers browser third-party cookie blocking.
* **Handshake Mechanism:** Top-level popup OAuth callback handlers (`/api/oauth/figma/callback`, `/api/oauth/miro/callback`) write tokens to Upstash Redis using `SETEX` with a **300-second (5-minute) TTL**, mapped to `oauth:store:${hashId(state)}`.
* **Consumer Polling:** The Miro plugin panel inside the desktop/iframe context polls `/api/oauth/store?state=...`, retrieves and deletes the token payload (`GET` + `DEL`), and completes login without persistent database storage.

### CORS & Private Network Access (PNA) Preflights
When local desktop calls are initiated (e.g. Tauri bridge):
* **Strict Origin Reflection:** Backend uses `tower_http`'s `AllowOrigin::mirror_request()` to reflect exact request origins rather than wildcards.
* **PNA Preflight Response:** Explicitly returns `Access-Control-Allow-Private-Network: true` to satisfy Chromium security preflights.
* **`targetAddressSpace` Fetch Parameter:** Local fetches append `targetAddressSpace: 'loopback'` to satisfy Chromium local network access policies.
