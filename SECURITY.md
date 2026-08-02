---
title: "Security Policy & Disclosure"
description: "Security architecture, vulnerability reporting procedures, zero-persistent-storage guarantees, and token encryption standards."
---

# Security Policy

## Supported Versions

We actively monitor and patch security vulnerabilities in SyncingBoard. Security updates are applied to the following versions:

| Version  | Supported       |
| -------- | --------------- |
| < 0.14.x | No              |
| 0.14.x   | Yes ✅          |

Always ensure you are running the latest release to receive active security updates.

---

## Security Posture

SyncingBoard is designed with a **zero-persistent-storage, cloud-relay-first** architecture that minimizes attack surface:

### Authentication & Token Handling

- **OAuth tokens are stored in Miro board storage** (via `board.storage.set`), with a **localStorage fallback** for same-origin contexts. Tokens are never persisted server-side beyond an ephemeral Upstash Redis cache (300s TTL) used only during OAuth popup handoff.
- Token refresh uses an ephemeral Upstash Redis cache (300s TTL) with automatic deletion on consumption — no long-lived token storage on the server.
- **OAuth CSRF protection** via cryptographically secure `state` parameters generated with `window.crypto.getRandomValues()`. State values are validated server-side before accepting the callback.
- **Pairing IDs** (Penpot ↔ Miro link) are read-only fields in the UI and generated via `crypto.getRandomValues()` — users cannot inject custom values.

### API Protection

- **Community Plan rate limiting** — per-user token-based throttling on all sync endpoints. Identifiers are hashed with SHA-256 to avoid storing raw tokens in rate-limit counters. A global daily backstop (500 syncs/day) prevents free-tier budget exhaustion regardless of attacker IP cycling.
- **Token-based identification** — rate limit keys use `SHA256(OAuth token)` or `SHA256(pairingId)` instead of client IP, making the limiter immune to VPN/proxy cycling. IP fallback only applies to unauthenticated requests (tightly capped at 5 req/min).
- **CORS origin whitelisting** on all API routes — only trusted domains (`https://syncingboard.com`, `http://localhost:3000`) are permitted.
- **Generic error responses** — API endpoints sanitize exceptions to avoid leaking stack traces or internal paths to clients.
- **Orphan endpoint cleanup** — unused relay routes (`/api/relay/penpot/poll`, `/api/relay/penpot/register`) have been removed to reduce the attack surface.

### Transport Security

- **Penpot sync uses the cloud relay** (Ably WebSocket + Upstash Redis over public HTTPS), not localhost WebSocket or HTTP calls. This avoids exposure to **Private Network Access (PNA)** restrictions and prevents browsers from making mixed-content requests from `https://` origins to local servers.
- **Figma sync is cloud-native** — the Figma Render API delivers images directly to Miro via the SyncingBoard relay. No local servers or desktop agents are required for day-to-day sync.
- **SyncBridge (Tauri)** is fully **optional** — only needed for large images (>4.5MB), Adobe UXP integration, or local LLMs. When enabled, it uses a locally-trusted HTTPS certificate (`mkcert`) for secure communication with Miro Desktop (Electron).

### Surface Area Reduction

- Legacy Tauri bridge routes (WebSocket, local polling, local export triggers) have been pruned — the desktop app now only serves the capability-extender role.
- Temporary/scratch files (`.html` stubs, `.txt` notes) are excluded from production builds.

---

### GDPR & Data Protection

SyncingBoard's architecture is designed for **data minimization by default**, making self-hosted deployments naturally GDPR-compliant:

#### Data Flow Summary

| Data type | Where it lives | Duration | PII? |
|---|---|---|---|
| OAuth tokens (Figma, Miro) | Browser memory (React state) + Upstash Redis (300s TTL) | Session / 5 minutes | Yes (could identify a user) |
| Penpot pairing IDs | Browser memory + Redis relay result | Session / 180s TTL | Indirect (linkable to a session) |
| Image content (frame screenshots) | Vercel function memory + Upstash Redis (180s TTL) + Miro API | Ephemeral (< 180s) | No (design frame, not personal) |
| Client IP addresses | Vercel edge logs (standard HTTP logs) | Retained per Vercel's policy | Yes |
| User agent, request paths | Vercel function logs | Retained per Vercel's policy | No |

#### Self-Hosting (Recommended for GDPR)

SyncingBoard is open source. Self-hosting on your own infrastructure (Docker, VPS, ECS) means **no data leaves your control**:

- All OAuth tokens stay in your browser session or your Redis instance
- Image data flows through your Vercel/Next.js deployment and your Redis
- No third party accesses your design data
- You are the data controller and processor — no DPA needed with SyncingBoard project

#### Public Instance (syncingboard.com)

If using the public demo instance, the operator acts as a **data processor**. The following sub-processors are involved:

| Sub-processor | Service | GDPR DPA | Data processed |
|---|---|---|---|
| **Vercel Inc.** | Serverless hosting | [Vercel DPA](https://vercel.com/legal/dpa) | HTTP requests, IP addresses, function logs |
| **Ably Inc.** | WebSocket relay | [Ably DPA](https://ably.com/legal/data-processing-agreement) | Penpot command messages (no PII, only pairing IDs) |
| **Upstash Inc.** | Redis cache | [Upstash DPA](https://upstash.com/gdpr) | OAuth tokens (300s TTL), relay results (180s TTL) |

#### Your Rights (Art. 15-22 GDPR)

Since SyncingBoard stores **no persistent user data**:

- **Right to access / erasure:** There is no database with user records to access or delete. OAuth tokens are ephemeral (300s TTL or browser session lifetime).
- **Right to data portability:** We do not store any personal data that could be exported.
- **Right to object:** Self-hosting eliminates all third-party data processing.

For any GDPR-related inquiries about the public instance, contact: `security@syncingboard.com`

---

## Reporting a Vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

If you discover a security vulnerability or exploit in SyncingBoard, please report it privately:

- **Email:** security@syncingboard.com

When reporting, include:

1. A detailed description of the vulnerability.
2. Step-by-step instructions or proof-of-concept (PoC) to reproduce the issue.
3. The potential impact and any affected components (e.g., OAuth flow, relay transport, API endpoints).

We will:

- **Acknowledge** your report within **48 hours**.
- **Investigate** and determine a remediation plan.
- **Release a patch** and notify you when a fix is available.

Please keep the details confidential until we have had reasonable time to secure our users' environments and release a fix.

Thank you for helping keep SyncingBoard secure!
