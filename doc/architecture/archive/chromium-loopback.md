---
title: Chromium Loopback & Sandboxing Security
description: Historical engineering research on Chromium Private Network Access (PNA), iframe sandboxing, and desktop SSL trust stores.
---

# Appendix A: Chromium Loopback & Sandboxing Security

> **Status:** historical — research findings documented for reference, no longer actionable.

During development and security auditing, we uncovered several strict browser-level constraints regarding secure loopback requests from inside Miro's iframe environments.

---

## A. Chromium Local Network Access (LNA) Iframe Restriction

Modern Chromium browsers block public websites inside cross-origin `iframe` containers from making requests to local network loopback (`127.0.0.1`/`localhost`), regardless of CORS or SSL certificate validity.

* **Constraint:** Unless the parent page (`miro.com`) sets `allow="loopback-network"` on the iframe element, the browser blocks loopback fetch and WebSocket connections.
* **Solution:** The Miro Desktop App (built on Electron) is not subject to this strict sandboxing rule, allowing the Miro plugin to query local companion servers directly.

---

## B. Strict CORS Private Network Access (PNA) Preflights

When LNA is bypassed (e.g., inside Electron/Miro Desktop), Chromium requires a secure context (HTTPS) and enforces a strict preflight check (`OPTIONS` request) for local connections.

* **Constraint:** The server **must not** return a wildcard `*` for `Access-Control-Allow-Origin` during PNA preflights; it must echo back the exact requesting origin (e.g. `https://syncboard.luiskobayashi.com`).
* **Solution:** The Axum backend uses `tower_http`'s `AllowOrigin::mirror_request()` to dynamically reflect the request origin header and explicitly returns `Access-Control-Allow-Private-Network: true`.

---

## C. Chromium `targetAddressSpace` Fetch Parameter

To prevent silent network scanning, Chromium requires active labeling of fetches targeting loopback devices.

* **Solution:** All frontend loopback queries to port 4401 are configured with `targetAddressSpace: 'loopback'` fetch options.

---

## D. Electron Isolated SSL Trust Store

While standard browsers trust custom root certificates (like `mkcert` CA) immediately after system registry installation (`mkcert -install`), Electron clients do not dynamically sync newly registered system CAs.

* **Constraint:** If certificates are modified, parent applications (Miro Desktop) must be fully restarted to refresh the Electron SSL trust engine.

---

## E. Redirection Isolation (Desktop OAuth Polling)

Opening Miro or Figma authentication pages in Miro Desktop opens the system browser. Once auth completes in the system browser, the OAuth callback cannot redirect back to the Miro Desktop context due to process isolation.

* **Solution:** We implemented a **stateless OAuth state polling mechanism** (`src/app/api/oauth/store/route.ts`):
  1. The Miro plugin generates a unique random `state` and registers it before opening the OAuth popup/browser.
  2. System browser OAuth callbacks (`/api/oauth/figma/callback`, `/api/oauth/miro/callback`) store tokens in Upstash Redis via `SETEX` with a **300-second (5-minute) TTL**, mapped to `oauth:store:${hashId(state)}`.
  3. The Miro plugin inside the desktop/iframe context polls `/api/oauth/store?state=...`, retrieves and deletes the token payload (`GET` + `DEL`), and completes authentication without third-party cookies.
