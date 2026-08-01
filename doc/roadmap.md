---
title: Product Roadmap
description: Strategic milestones, upcoming features, and future architecture plans for SyncingBoard.
---

# Product Roadmap

This roadmap outlines planned features, architecture expansions, and research targets for SyncingBoard.

---

* **Push-Sync from Figma & Penpot Companion Plugins to Miro:** Trigger sync operations directly from inside Figma and Penpot companion plugins without opening the Miro sidebar.
* **Locked Widget Guard:** Automatically skip locked Miro widgets during "Sync All" with an optional *"Ignore Lock"* override checkbox.
* **In-Plugin Card Deselection:** Add a `"✕"` action button on sidebar item cards to let designers curate the 3-frame sync batch without deselecting elements on the Miro canvas.
* **Selection Auto-Detect UX:** Streamline the Pairing ID handshake and status indicators across Penpot and Figma companion plugins.
* **Animated GIF & Video Sync:** Export and sync Figma prototype animations and video frames into Miro as live animated GIF and playable video widgets.
* **Image Compression & Format Conversion:** Optimize synced image buffers with WebP/AVIF compression and format conversions before uploading to whiteboard widgets.
* **Local Document & Data Parsing:** Extend SyncingBoard to import and render local Office documents, PDFs, and Markdown files onto whiteboards.
* **MCP Server Integration:** Model Context Protocol (MCP) server integration (`mcp-roadmap.md`) allowing AI coding agents (Antigravity, Claude, Cursor) to inspect Miro canvas selections and trigger sync operations.
* **Multi-Whiteboard Platform Expansion (Target Whiteboards):** Expand target whiteboard adapters beyond Miro to support Mural, Microsoft Whiteboard, Excalidraw, and tldraw.
* **Adobe UXP Companion:** Extender plugin for Adobe XD / Photoshop canvas surfaces.
* **Tauri SyncBridge Desktop Extender:** Native desktop extender for streaming large image payloads (>4.5MB), local LLM canvas assistants, and two-way sync.
* **Additional Source Adapters:** Research adapters for UXPin, Framer, Lovable, and Stitch.
