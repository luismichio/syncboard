# SyncBoard (Figma & Penpot to Miro Sync Engine)

SyncBoard is a stateless, open-source integration tool that lets product and design teams sync design screens from **Figma** and **Penpot** directly into Miro boards as lightweight, flat images. It prevents canvas clutter by updating images **in-place** (zero duplicates) using metadata tagged inside Miro's native `title` property.

Unlike official live embeds which require browser logins and degrade board performance, SyncBoard places fast-loading, flat images that stakeholders can annotate, draw on, and reference instantly.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fluismichio%2Fsyncboard&env=FIGMA_CLIENT_ID,FIGMA_CLIENT_SECRET,MIRO_CLIENT_ID,MIRO_CLIENT_SECRET,NEXT_PUBLIC_APP_URL,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,ABLY_API_KEY)

---

## ✨ Features

* **In-Place Updates:** SyncBoard utilizes a custom `PATCH` update mechanism that replaces the binary image file of the Miro widget while keeping its position, dimensions, rotation, and parent frames intact.
* **Consolidated Selection & Copies Counter:** Group duplicates of the same frame inside the sidebar under a single card, displaying a count badge (e.g., `x3`) in the top-right. Updating scale or format updates all copies simultaneously.
* **Dual-Platform Sync:** Supports **Figma** (cloud-native sync) and **Penpot** (relay-first sync for browser sandbox compatibility) side-by-side.
* **Zero-Setup Figma Sync:** Connects to Figma's public API to render and update screens in the cloud with no local servers or databases required.
* **Cloud Relay Transport (Penpot):** Public HTTPS relay (Upstash Redis + Vercel) coordinates between the Penpot Companion plugin and the Miro plugin — no localhost calls, no PNA blocks, works in any browser.
* **SyncBridge Companion (Optional Desktop Extender):** Tauri-powered desktop app for advanced capabilities — large images (>4.5MB), Adobe UXP bridge, local LLMs, two-way sync. Not required for day-to-day sync.

### 📐 Integration & Compatibility Matrix

| Feature | Design Tool Context | Miro Client | SyncBridge / Tauri Required? |
| :--- | :--- | :--- | :--- |
| **Figma URL Import / Sync** | Browser or Desktop | Browser or Desktop | **No** (Cloud API sync) |
| **Figma Auto-Detect Selection** | Figma Desktop or Browser | Any | **No with Figma plugin** (planned) / **Yes with SyncBridge** (current fallback) |
| **Penpot URL Import & Selection** | Penpot Browser | Any | **No** (Cloud relay — works in any browser via Companion plugin) |
| **Penpot Export & Render** | Penpot Browser | Any | **No** (Companion plugin renders locally, relay handles transport) |
| **Large Images (>4.5MB)** | Any | Any | **Optional** (SyncBridge bypasses Vercel body limit) |
| **Adobe UXP / Local LLMs / Two-Way Sync** | Desktop apps | Any | **Optional** (SyncBridge capability extender) |
| **Figma / Miro Login (OAuth)** | Any browser | Browser or Desktop | **No** (Stateless OAuth polling) |

> **📖 Full setup & deployment guide → [/docs/setup](/docs/setup)**  
> **🔧 Tauri/SyncBridge setup → [/docs/setup#7-tauri-desktop-app-syncbridge-optional](/docs/setup)**  
> **📐 Architecture reference → [/docs/architecture](/docs/architecture)**

---

## 📄 License
This project is open-source and licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for more details.
