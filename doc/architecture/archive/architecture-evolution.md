---
title: Architecture Evolution Log
description: Decision log detailing the shift from local Tauri loopback transport to Cloud-Relay-First architecture.
---

# Appendix B: Architecture Evolution — Cloud-Relay-First with Tauri as Capability Extender

> **Status:** historical — decision log, context only.

As of **v0.5.1**, the architecture shifted based on real-world PNA findings and the adoption of cloud relay for Penpot transport.

---

## Discovery: PNA Blocks All Browser -> Localhost Transport

Chrome's Private Network Access (PNA) blocks both `fetch()` and `WebSocket` from public origins (Miro plugin sandbox, Penpot web app) to loopback/localhost, regardless of CORS headers or valid SSL. This made Tauri's original role as a local transport bridge unviable from browser contexts.

---

## Decision: Cloud-Relay-First Architecture

| Layer | Before (Tauri Transport) | After (Cloud Relay) |
| :--- | :--- | :--- |
| **Penpot transport** | Tauri WebSocket localhost | Ably WebSocket + Upstash Redis relay |
| **Figma selection** | Tauri MCP Figma Desktop port | Figma plugin -> relay |
| **Penpot selection** | Tauri WebSocket -> Companion plugin | Companion plugin -> relay |
| **Selection source** | Tauri acts as producer/consumer | Plugin acts as producer, relay as transport |

---

## Tauri's Role: Capability Extender

Tauri is no longer required for day-to-day sync. It becomes an **optional desktop companion** for operations that exceed what a pure web plugin can do:

* **Large Binary Transport:** Bypasses Vercel 4.5MB serverless limits with chunked streaming.
* **Native Socket IPC:** Communicates with local desktop apps (Adobe UXP plugins, Obsidian local APIs, local MCP servers).
* **Local Compute:** Runs local LLMs (Ollama) orWAS/Squoosh image compression locally.
* **Background Sync:** Long-lived two-way watchers between Miro boards and local files or databases.

---

## Penpot Transport Evolution Timeline

| Phase | Transport Mechanism | Problem Solved | Limitation |
|---|---|---|---|
| **v0.4.0** | Tauri WSS | Bypassed mixed-content browser blocks | Chrome PNA blocked browser localhost |
| **v0.5.0** | HTTP long-poll | Passed Chrome PNA checks via `targetAddressSpace` | Caused 1,000 Redis commands/sec idle |
| **v0.5.1+** | Cloud Relay | Eliminated localhost dependencies entirely | Higher network latency round-trip |
