# SyncBoard (Figma & Penpot to Miro Sync Engine)

[![Version 0.6.0](https://img.shields.io/badge/version-0.6.0-%23007ACC?style=flat-square)](https://github.com/luismichio/syncboard/blob/dev/package.json)
[![OSI Approved License](https://img.shields.io/badge/license-Apache%202.0-%23A81C7D?style=flat-square&label=OSI%20Approved)](https://github.com/luismichio/syncboard/blob/dev/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-%23007ACC.svg?style=flat-square&logo=typescript&logoColor=white)](https://github.com/luismichio/syncboard/blob/dev/tsconfig.json)
[![CI](https://img.shields.io/github/actions/workflow/status/luismichio/syncboard/ci.yml?branch=dev&style=flat-square&label=CI)](https://github.com/luismichio/syncboard/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-%23FF6B6B?style=flat-square)](https://github.com/luismichio/syncboard/issues/new)
[![Next.js](https://img.shields.io/badge/Next.js-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Miro](https://img.shields.io/badge/Miro-FFD02F?style=flat-square&logo=miro&logoColor=black)](https://developers.miro.com)
[![Figma](https://img.shields.io/badge/Figma-F24E1E?style=flat-square&logo=figma&logoColor=white)](https://www.figma.com/developers/api)
[![Penpot](https://img.shields.io/badge/Penpot-000000?style=flat-square&logo=penpot&logoColor=white)](https://penpot.app)
[![Vercel](https://img.shields.io/badge/Vercel-deployed-black?style=flat-square&logo=vercel)](https://vercel.com)
[![Ably](https://img.shields.io/badge/Ably-Realtime-%23F9A01B?style=flat-square&logo=ably&logoColor=white)](https://ably.com)
[![Upstash](https://img.shields.io/badge/Upstash-Redis-%230E1112?style=flat-square&logo=upstash&logoColor=white)](https://upstash.com)


> **Community Edition:** This public instance is rate-limited to protect shared infrastructure. Limits reset daily. See [doc/setup.md#-rate-limiting-community-protection](https://github.com/luismichio/syncboard/blob/dev/doc/setup.md#-rate-limiting-community-protection) to configure your own deployment.

SyncBoard is a stateless, open-source integration tool that lets product and design teams sync design screens from **Figma** and **Penpot** directly into Miro boards as lightweight, flat images. It prevents canvas clutter by updating images **in-place** (zero duplicates) using metadata tagged inside Miro's native `title` property.

Unlike official live embeds which require browser logins and degrade board performance, SyncBoard places fast-loading, flat images that stakeholders can annotate, draw on, and reference instantly.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fluismichio%2Fsyncboard&env=FIGMA_CLIENT_ID,FIGMA_CLIENT_SECRET,MIRO_CLIENT_ID,MIRO_CLIENT_SECRET,NEXT_PUBLIC_APP_URL,UPSTASH_REDIS_REST_URL,UPSTASH_REDIS_REST_TOKEN,ABLY_API_KEY)

---

## Features

* **In-Place Updates:** SyncBoard utilizes a custom `PATCH` update mechanism that replaces the binary image file of the Miro widget while keeping its position, dimensions, rotation, and parent frames intact.
* **Consolidated Selection & Copies Counter:** Group duplicates of the same frame inside the sidebar under a single card, displaying a count badge (e.g., `x3`) in the top-right. Updating scale or format updates all copies simultaneously.
* **Dual-Platform Sync:** Supports **Figma** (cloud-native sync) and **Penpot** (relay-first sync for browser sandbox compatibility) side-by-side.
* **Zero-Setup Figma Sync:** Connects to Figma's public API to render and update screens in the cloud with no local servers or databases required.
* **Cloud Relay Transport (Penpot):** Public HTTPS relay (Upstash Redis + Vercel) coordinates between the Penpot Companion plugin and the Miro plugin --- no localhost calls, no PNA blocks, works in any browser.
* **SyncBridge Companion (Optional Desktop Extender):** Tauri-powered desktop app for advanced capabilities --- large images (>4.5MB), Adobe UXP bridge, local LLMs, two-way sync. Not required for day-to-day sync.

### Integration & Compatibility Matrix

| Feature | Design Tool Context | Miro Client | SyncBridge / Tauri Required? |
| :--- | :--- | :--- | :--- |
| **Figma URL Import / Sync** | Browser or Desktop | Browser or Desktop | **No** (Cloud API sync) |
| **Figma Auto-Detect Selection** | Figma Desktop or Browser | Any | **No with Figma plugin** (planned) / **Yes with SyncBridge** (current fallback) |
| **Penpot URL Import & Selection** | Penpot Browser | Any | **No** (Cloud relay --- works in any browser via Companion plugin) |
| **Penpot Export & Render** | Penpot Browser | Any | **No** (Companion plugin renders locally, relay handles transport) |
| **Large Images (>4.5MB)** | Any | Any | **Optional** (SyncBridge bypasses Vercel body limit) |
| **Adobe UXP / Local LLMs / Two-Way Sync** | Desktop apps | Any | **Optional** (SyncBridge capability extender) |
| **Figma / Miro Login (OAuth)** | Any browser | Browser or Desktop | **No** (Stateless OAuth polling) |

> ** Full setup & deployment guide -> [doc/setup.md](https://github.com/luismichio/syncboard/blob/dev/doc/setup.md)**
>
> ** Tauri/SyncBridge setup -> [doc/setup.md#-7-tauri-desktop-app-syncbridge-optional](https://github.com/luismichio/syncboard/blob/dev/doc/setup.md#-7-tauri-desktop-app-syncbridge-optional)**
>
> ** Architecture reference -> [doc/architecture.md](https://github.com/luismichio/syncboard/blob/dev/doc/architecture.md)**

---

## License
This project is open-source and licensed under the **Apache License 2.0**. See the [LICENSE](https://github.com/luismichio/syncboard/blob/dev/LICENSE) file for more details.
