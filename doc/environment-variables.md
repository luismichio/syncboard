---
title: Environment Variables
description: Complete reference for all configuration keys, secret keys, cloud credentials, and rate-limiting options in SyncingBoard.
---

# Environment Variables Reference

This document provides a comprehensive reference of all environment variables supported by SyncingBoard. Environment variables are configured in `.env.local` for local development or set in your hosting platform (Vercel, AWS ECS, Netlify, Railway, Docker).

---

## Core System & Domain Configuration

| Variable | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | String | **Yes** | None | The full public HTTPS URL of your deployment (e.g. `https://syncingboard.com`). **Do not include a trailing slash.** Used for OAuth redirects and CORS policy matching. |

---

## Target Adapter: Miro Credentials

| Variable | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `MIRO_CLIENT_ID` | String | **Yes** | None | Client ID generated in your Miro Developer App Portal. |
| `MIRO_CLIENT_SECRET` | String | **Yes** | None | Client Secret generated in your Miro Developer App Portal. Keep server-side only. |

---

## Source Adapter: Figma Credentials

| Variable | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `FIGMA_CLIENT_ID` | String | **Figma Only** | None | Client ID generated in the Figma Developer Apps Portal (`https://www.figma.com/developers/apps`). |
| `FIGMA_CLIENT_SECRET` | String | **Figma Only** | None | Client Secret generated in the Figma Developer Apps Portal. Keep server-side only. |

---

## Cloud Infrastructure Services

| Variable | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `UPSTASH_REDIS_REST_URL` | String | **Penpot / Rate-Limiting** | None | Upstash Redis REST database URL (e.g., `https://xxx.upstash.io`). Required for Penpot image buffer relay and persistent serverless rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | String | **Penpot / Rate-Limiting** | None | Upstash Redis REST bearer authentication token. Keep server-side only. |
| `ABLY_API_KEY` | String | **Figma Relay & Penpot** | None | Ably Realtime API key (format: `appId.keyId:keySecret`). Required for Penpot WebSocket render signaling and Figma Companion selection auto-detect relay. |

---

## Rate Limiting & Protection Controls

SyncingBoard includes an optional 3-layer protection engine. Redis-backed rate limits are active when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured; persistent Node hosts fall back to in-memory limits when Redis is absent.

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `RATE_LIMIT_ENABLED` | Boolean | `true` | Set to `false` to disable rate limiting entirely. |
| `RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN` | Number | `5` | Figma node-info and render requests allowed per minute per user OAuth token hash. |
| `RATE_LIMIT_COMMUNITY_FIGMA_PER_DAY` | Number | `50` | Figma render requests allowed per day per user OAuth token hash. |
| `RATE_LIMIT_COMMUNITY_RELAY_PER_MIN` | Number | `5` | Penpot relay render requests allowed per minute per pairing ID. |
| `RATE_LIMIT_COMMUNITY_RELAY_PER_HOUR` | Number | `30` | Penpot relay render requests allowed per hour per pairing ID. |
| `RATE_LIMIT_COMMUNITY_RELAY_PER_DAY` | Number | `100` | Penpot relay render requests allowed per day per pairing ID. |
| `RATE_LIMIT_COMMUNITY_RELAY_SESSION_PER_MIN` | Number | `4` | Miro relay-session heartbeat/release requests allowed per minute per session ID. |
| `RATE_LIMIT_COMMUNITY_MAX_RELAY_SESSIONS` | Number | `40` | Maximum concurrent relay sessions across the Community deployment (target/source agnostic: Figma/Penpot → Miro today, FigJam/Mural later). Legacy alias: `RATE_LIMIT_COMMUNITY_MAX_MIRO_RELAY_SESSIONS`. |
| `RATE_LIMIT_COMMUNITY_MAX_COMPANION_TOKENS` | Number | `180` | Maximum concurrent companion Ably tokens across the Community deployment (Figma/Penpot companions). Miro detectors keep a permanent 20-socket floor on top of this. |
| `RATE_LIMIT_COMMUNITY_UPDATE_IMAGE_PER_MIN` | Number | `10` | Miro image updates allowed per minute per user token. |
| `RATE_LIMIT_COMMUNITY_ABLY_TOKEN_PER_MIN` | Number | `5` | Ably token authentication requests allowed per minute per client IP. |
| `RATE_LIMIT_COMMUNITY_OAUTH_REFRESH_PER_MIN` | Number | `3` | OAuth refresh exchanges allowed per minute per refresh-token hash. |
| `RATE_LIMIT_COMMUNITY_GLOBAL_SYNCS_PER_DAY` | Number | `500` | Global daily cap on Figma render and Miro image-update resource operations across all users. |
| `RATE_LIMIT_COMMUNITY_OAUTH_CALLBACK_PER_MIN` | Number | `20` | OAuth provider redirect callbacks allowed per minute per client IP. |
| `RATE_LIMIT_COMMUNITY_RELAY_EXPORT_PER_MIN` | Number | `2` | Relay export commands allowed per minute per pairing ID. |
| `RATE_LIMIT_COMMUNITY_RELAY_EXPORT_PER_DAY` | Number | `20` | Relay export commands allowed per day per pairing ID. |

---

## Sample `.env.example` Template

Below is a complete template for your `.env.local` file during development or deployment setup:

```env
# ==========================================
# Core System & Domain Configuration
# ==========================================
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ==========================================
# Target Adapter: Miro OAuth Credentials
# ==========================================
MIRO_CLIENT_ID=your_miro_client_id
MIRO_CLIENT_SECRET=your_miro_client_secret

# ==========================================
# Source Adapter: Figma OAuth Credentials
# ==========================================
FIGMA_CLIENT_ID=your_figma_client_id
FIGMA_CLIENT_SECRET=your_figma_client_secret

# ==========================================
# Cloud Relay & Storage Services
# ==========================================
UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
ABLY_API_KEY=your_ably_api_key

# ==========================================
# Optional Rate Limiting Overrides
# ==========================================
RATE_LIMIT_ENABLED=true
RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN=5
RATE_LIMIT_COMMUNITY_FIGMA_PER_DAY=50
RATE_LIMIT_COMMUNITY_GLOBAL_SYNCS_PER_DAY=500
```
