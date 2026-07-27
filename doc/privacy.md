---
title: Privacy
description: SyncBoard privacy policy — what transient operational data we process, your GDPR rights, and how we never store your design data.
---

# Privacy

**Last updated:** 2026-07-26

SyncBoard is designed with privacy as a core principle. Your design data stays in your tools — we never store your frames, images, or personal files.

---

## What we DO store (transient operational data)

We process minimal operational data to keep the service running, secure, and functional. All of it is **transient** — automatically deleted within minutes.

| Data | Purpose | Storage | Duration | Legal Basis |
|------|---------|---------|----------|-------------|
| **IP address** | Rate limiting & abuse prevention | Redis or in-memory counter | Minutes to hours (window TTL) | Legitimate interest (Art. 6(1)(f) GDPR) |
| **OAuth state parameter** | CSRF protection during OAuth handshake | Redis `SET NX EX 300` | 5 minutes | Legitimate interest (security) |
| **Relay response payload** | Transport buffer for Penpot companion plugin relay | Redis `SETEX` | 45 seconds | Contractual necessity (providing the relay feature) |
| **Ably connection metadata** | WebSocket channel routing | Transient, not logged | Connection lifetime | Contractual necessity |
| **Google Analytics** | Anonymous usage metrics (page views, feature interactions) | Google's servers | Per Google's policy | Consent (opt-in via cookie banner) |

**We do NOT store:**
- Your Figma, Penpot, or Miro design files or frames
- Your exported images or SVGs
- Your OAuth access or refresh tokens (stored only in your browser's `localStorage`)
- Your name, email, or account credentials
- Any personal identification beyond IP address

---

## IP addresses & rate limiting

IP addresses are tracked in ephemeral rate limit counters to prevent abuse of the free service (e.g., exceeding 60 requests per minute). This is a standard security practice for any public API.

- **Stored in:** Redis (on Vercel) or in-memory (on self-hosted persistent infra)
- **Duration:** Automatically expires after the rate limit window
- **Not logged:** We do not maintain logs of IP addresses or request histories
- **Self-hosted:** You can disable rate limiting entirely by setting `RATE_LIMIT_ENABLED=false` in your environment

---

## Google Analytics

The public documentation site uses Google Analytics (G-Q4W94QDWWC) to measure anonymous usage — which docs are read, general visit counts, and referrer sources.

- **Consent required:** GA is blocked by default. The cookie banner asks for your opt-in before any tracking data is sent.
- **No personal data:** We do not collect names, emails, or any personally identifying information via analytics.
- **The Miro plugin iframe:** Does not load GA at all — no tracking occurs inside the plugin.

---

## Third-party services

| Service | What it processes | Data shared |
|---------|-------------------|-------------|
| **Ably** | WebSocket relay for companion plugin communication | Transient channel metadata, no design content retained |
| **Upstash Redis** | Rate limiting, OAuth state, relay buffers | IP addresses, temporary state parameters (auto-deleted) |
| **Vercel** | Serverless function execution | Standard Vercel logs (request path, timestamp, status code) |
| **Google Analytics** | Anonymous page views (opt-in only) | Standard GA4 anonymous visit data |

---

## Self-hosted deployment

If you self-host SyncBoard (via Docker or Vercel clone), **no data leaves your infrastructure** except what you explicitly configure:

- Ably: Optional — only needed for Penpot relay. You can run Figma-only without it.
- Redis: Optional — rate limiting falls back to in-memory on persistent hosts.
- GA: Not loaded unless you configure `NEXT_PUBLIC_GA_ID`.

---

## Your rights (GDPR)

Since we store no personal data beyond ephemeral IP counters, there is nothing to access, rectify, or delete. If you have concerns, you can:

- **Disable rate limiting:** `RATE_LIMIT_ENABLED=false`
- **Decline analytics:** Click "DECLINE" on the cookie banner
- **Use self-hosted:** Clone the repo and run on your own infrastructure

For any questions, open an issue on [GitHub](https://github.com/luismichio/syncboard).
