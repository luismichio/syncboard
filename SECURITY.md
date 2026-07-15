# Security Policy

## Supported Versions

We actively monitor and patch security vulnerabilities in SyncBoard. Security updates are applied to the following versions:

| Version | Supported |
| ------- | --------- |
| < 0.5.x | ❌ No     |
| 0.5.x   | ✅ Yes    |

Always ensure you are running the latest release to receive active security updates.

---

## Security Posture

SyncBoard is designed with a **zero-persistent-storage, cloud-relay-first** architecture that minimizes attack surface:

### 🔐 Authentication & Token Handling

- **OAuth tokens live only in the browser session** (in-memory React state). They are never stored in `localStorage`, cookies, or server-side databases.
- Token refresh uses an ephemeral Upstash Redis cache (300s TTL) with automatic deletion on consumption — no long-lived token storage on the server.
- **OAuth CSRF protection** via cryptographically secure `state` parameters generated with `window.crypto.getRandomValues()`. State values are validated server-side before accepting the callback.
- **Pairing IDs** (Penpot ↔ Miro link) are read-only fields in the UI and generated via `crypto.getRandomValues()` — users cannot inject custom values.

### 🌐 API Protection

- **CORS origin whitelisting** on all API routes — only trusted domains (`https://syncboard.yourdomain.com`, `http://localhost:3000`) are permitted.
- **Generic error responses** — API endpoints sanitize exceptions to avoid leaking stack traces or internal paths to clients.
- **Orphan endpoint cleanup** — unused relay routes (`/api/relay/penpot/poll`, `/api/relay/penpot/register`) have been removed to reduce the attack surface.

### 🔗 Transport Security

- **Penpot sync uses the cloud relay** (Ably WebSocket + Upstash Redis over public HTTPS), not localhost WebSocket or HTTP calls. This avoids exposure to **Private Network Access (PNA)** restrictions and prevents browsers from making mixed-content requests from `https://` origins to local servers.
- **Figma sync is cloud-native** — the Figma Render API delivers images directly to Miro via the SyncBoard relay. No local servers or desktop agents are required for day-to-day sync.
- **SyncBridge (Tauri)** is fully **optional** — only needed for large images (>4.5MB), Adobe UXP integration, or local LLMs. When enabled, it uses a locally-trusted HTTPS certificate (`mkcert`) for secure communication with Miro Desktop (Electron).

### 🧹 Surface Area Reduction

- Legacy Tauri bridge routes (WebSocket, local polling, local export triggers) have been pruned — the desktop app now only serves the capability-extender role.
- Temporary/scratch files (`.html` stubs, `.txt` notes) are excluded from production builds.

---

## Reporting a Vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

If you discover a security vulnerability or exploit in SyncBoard, please report it privately:

- **Email:** security-syncboard@luiskobayashi.com

When reporting, include:

1. A detailed description of the vulnerability.
2. Step-by-step instructions or proof-of-concept (PoC) to reproduce the issue.
3. The potential impact and any affected components (e.g., OAuth flow, relay transport, API endpoints).

We will:

- **Acknowledge** your report within **48 hours**.
- **Investigate** and determine a remediation plan.
- **Release a patch** and notify you when a fix is available.

Please keep the details confidential until we have had reasonable time to secure our users' environments and release a fix.

Thank you for helping keep SyncBoard secure!
