# Task Plan: SyncBoard (Figma-Miro Sync Engine)

SyncBoard is a stateless, open-source integration that allows developers and teams to sync Figma frames to Miro boards as lightweight, flat images. It prevents duplicates by updating images in-place using metadata tags in Miro's `altText`.

## 🛠️ Technology Stack
* **Framework:** Next.js (React + TypeScript)
* **Styling:** Tailwind CSS (Vanilla theme variables)
* **Communication:** Browser BroadcastChannel API (tab-to-tab context sync)
* **Database:** None (Stateless Client-Side Token Storage)
* **Hosting:** Vercel (Hobby plan compatible)
* **License:** Apache 2.0

---

## 📈 Development Phases

### Phase 1: Project Initialization & Environment Setup
- [x] Create Next.js project template (`npx create-next-app@latest syncboard --ts --tailwind --eslint --src-dir --app`)
- [x] Define the base directory structure (Miro sidebar router and Dashboard router)
- [x] Write initial developer configuration files

### Phase 2: Stateless Authentication (OAuth Bridge)
- [x] Implement Miro OAuth code exchange API endpoint (`/api/oauth/miro/callback`)
- [x] Implement Figma OAuth code exchange API endpoint (`/api/oauth/figma/callback`)
- [x] Implement client-side helper utility to save, read, and delete tokens in the browser (`localStorage`) securely
- [x] Implement middleware/helpers to attach user tokens to outgoing REST API proxy calls

### Phase 3: Core Sync Engine (Figma to Miro)
- [x] Create Figma Image Render proxy endpoint (`/api/figma/render`) to fetch vector frames as PNGs
- [x] Build the Miro Web SDK Sidebar frontend panel
  - [x] Implement authorization checkers for Miro and Figma
  - [x] Implement canvas scanner to query image items
  - [x] Implement in-place image file content updating (`PATCH` to Miro API via multipart upload)
  - [x] Add structured JSON metadata tagging inside image `altText` to prevent duplication

### Phase 4: Real-time Selection Tracking (Figma Desktop Integration)
- [x] Add client-side listener in Miro Sidebar to call local Figma Desktop MCP server (`http://127.0.0.1:3845/mcp`)
- [x] Build UI showing active Figma selection inside Miro panel, allowing "One-Click Import"

### Phase 5: Virtual Catalog & Cross-Tab Sync
- [x] Build the Dashboard webapp interface for browsing and searching Figma frames
- [x] Set up BroadcastChannel communication (`figma_miro_sync`) between the Miro Sidebar tab and Dashboard tab
- [x] Implement real-time panel updates: clicking a synced image in Miro immediately triggers UI status changes in the Dashboard tab

### Phase 6: Packaging & Open-Source Release
- [x] Write a detailed `README.md` with:
  - [x] "Deploy to Vercel" quickstart setup
  - [x] Clear guidelines on registering private Miro/Figma Developer credentials
- [x] Add `LICENSE` file (Apache 2.0)

---

## 📂 Key File Layout

```text
syncboard/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── oauth/
│   │   │   │   ├── figma/callback/route.ts
│   │   │   │   └── miro/callback/route.ts
│   │   │   └── figma/
│   │   │       └── render/route.ts
│   │   ├── dashboard/           # Standalone dashboard tab
│   │   │   └── page.tsx
│   │   └── miro-plugin/         # Embedded Miro sidebar panel
│   │       └── page.tsx
│   ├── components/              # Shared UI components
│   ├── hooks/                   # useBroadcastChannel, useMiroSelection
│   └── lib/                     # Figma/Miro API client helpers
├── LICENSE
└── README.md
```

---

## 🔒 Security & Edge Cases
* **CORS Block on localhost:** The browser might block requests from Miro's iframe to `localhost:3845` (Figma MCP).
  * *Mitigation:* We will document how to run a local proxy or establish proper headers if the Figma client blocks it, or use the Figma link copy fallback.
* **Token Expiry:** OAuth access tokens expire.
  * *Mitigation:* Frontend helper must handle automatic client-side token refresh via the backend proxy using refresh tokens stored in the browser.
* **Miro Caching:** Miro caches board images.
  * *Mitigation:* Appending dummy query timestamps or slightly modifying size properties forces Miro clients to request the fresh asset from their CDN.
