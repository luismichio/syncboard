---
title: Selection Detection & Cloud Relay Architecture
description: Real-time Ably WebSocket selection stream, zero-Redis selection transport, companionRelayClient, and 16-character secure pairing keys.
---

# Selection Detection & Cloud Relay Architecture

> **Status:** stable — Figma companion relay and Penpot companion relay both implemented via Ably WebSockets.

---

## Terminology & Relay Principles

The term **"Relay"** (and **"Relay-First"**) refers to the cloud-based event transport connecting Figma/Penpot companion plugins to the Miro sidebar without requiring local desktop daemons (Tauri) or server polling.

The Relay Architecture combines two complementary cloud infrastructure components:
* **Ably WebSockets (Direct Stream):** Handles real-time selection detection (`select` events), instant command triggers, and light metadata payloads (`{ fileKey, nodeId, name }`). Consumes **0 Upstash Redis commands**.
* **Upstash Redis (Ephemeral Single-Read Store):** Used exclusively for heavy binary image renders (Penpot base64 exports) that exceed WebSocket payload limits. Renders are stored with a 180-second TTL (`SETEX`) and deleted immediately after a single `GET` fetch (3 Redis commands per export: 1 SET, 1 GET, 1 DEL).

| Platform | Selection Transport | Heavy Image Transport | Status |
| :--- | :--- | :--- | :--- |
| **Figma** | Ably WebSockets (0 Redis) | Figma REST API v1 (Direct Serverless) | Stable — relay-first |
| **Penpot** | Ably WebSockets (0 Redis) | Hybrid Relay (Upstash Redis 180s TTL + Ably notification) | Stable — relay-first |
| **Adobe** | (Planned) UXP plugin -> Tauri local socket | Local HTTP / Socket | Tauri capability extender |

---

## Client Implementation & Companion Plugins

* **Unified Companion Relay Client (`companionRelayClient.ts`):** Both Figma and Penpot companion plugins communicate with the Miro sidebar via a unified `companionRelayClient.ts` module.
* **WebSocket Pre-Subscription & Early Buffer:** To prevent race conditions between HTTP request triggers and WebSocket response events, `companionRelayClient.ts` subscribes to Ably WebSocket events *before* firing the HTTP request and buffers any incoming `'result'` messages in an `earlyResults` Map.
* **Ably Token & Capabilities:** Ably tokens issued by `/api/ably/token` grant `['publish', 'subscribe', 'presence']` capabilities on pairing channels (`penpot:${pairingId}`), enabling zero-polling bidirectional streaming.
* **Figma Companion (`public/figma-companion-ui.html`):** Connects via WebSocket (Ably), subscribes to the pairing channel (`penpot:${pairingId}`) for `select` commands, retrieves selected frame metadata via `figma.root.getPluginData`, and publishes selection details directly over Ably to Miro with zero server polling and zero Redis commands.
* **Penpot Companion (`public/penpot-companion-ui.html`):** Connects via WebSocket (Ably), subscribes to the pairing channel for `select` or `export` commands, executes them using Penpot's native plugin API, and returns selection results directly over Ably or uploads heavy image buffers to Vercel/Redis with a `'result-ready'` Ably event.

---

## Cryptographically Secure Pairing IDs & UI Masking

* **Cryptographically Secure Keys (`src/lib/pairingId.ts`):** Pairing IDs are 16-character unguessable alphanumeric keys (`sb_` + 16 random chars) generated using `window.crypto.getRandomValues()`.
* **Password-Style UI Masking:** In the Miro plugin Settings tab, pairing IDs are password-masked (`●●●●●●●●`) by default to prevent shoulder-surfing during screen recordings or streams.
* **Instant Rotation (`rotatePairingId()`):** Provides a one-click key rotation button in the Settings panel that generates a fresh pairing ID and updates stored client state instantly.

---

## Why Not Tauri for Transport?

Chrome Private Network Access (PNA) blocks all browser -> localhost calls from public origins. Even with valid SSL certificates and correct CORS/PNA headers, both `fetch()` and `WebSocket` targeting loopback addresses are denied by modern Chromium browsers inside iframe contexts. Tauri remains valuable as an optional **capability extender** (see Appendix B), not as a transport bridge.
