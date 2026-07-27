---
title: Features & Video Demos
description: Explore SyncBoard's core capabilities in action with short video walkthroughs.
updated: 2026-07-26
---

# SyncBoard Features & Video Demos

Watch how SyncBoard bridges design tools (**Figma** & **Penpot**) with interactive canvas whiteboards (**Miro**) in real time.

---

## 1. Real-Time Selection Auto-Detect

SyncBoard's companion plugins stream active canvas selections in real time over **Ably WebSockets**. Selecting a frame in Figma Desktop or Penpot instantly populates the Miro sidebar panel — with **zero server polling** and **zero Redis overhead**.

<div className="my-6 aspect-video w-full overflow-hidden rounded-xl border border-border-card bg-bg-card shadow-sm">
  <iframe
    className="w-full h-full"
    src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"
    title="Real-Time Selection Auto-Detect Demo"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</div>

* **Key Highlights:**
  * Instant auto-detection across open design tabs/files.
  * Direct WebSocket channel pairing (`penpot:${pairingId}`).
  * Password-masked pairing key security (`●●●●●●●●`).

---

## 2. One-Click Sync & Multi-Copy Board Propagation

Update selected screens in-place on Miro canvas. Toggle **"Also update all board copies"** to automatically search the canvas and propagate screen updates across every duplicate widget simultaneously.

<div className="my-6 aspect-video w-full overflow-hidden rounded-xl border border-border-card bg-bg-card shadow-sm">
  <iframe
    className="w-full h-full"
    src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"
    title="One-Click Sync and Multi-Copy Propagation Demo"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</div>

* **Key Highlights:**
  * Single-click screen updates.
  * Batch limit protection (up to 3 unique images per sync on Community plan).
  * Auto-refresh frame names directly from Figma/Penpot APIs.

---

## 3. Widget Adoption & Retargeting ("Replace Selected")

Adopt any existing image widget on your Miro board (even non-SyncBoard imports or copy-pasted screenshots) or retarget an existing widget to a new Figma/Penpot frame **without changing widget IDs**.

<div className="my-6 aspect-video w-full overflow-hidden rounded-xl border border-border-card bg-bg-card shadow-sm">
  <iframe
    className="w-full h-full"
    src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"
    title="Widget Adoption and Retargeting Demo"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</div>

* **Key Highlights:**
  * Widget IDs remain intact.
  * Preserves canvas connectors, sticky note links, frame memberships, and comments.
  * Easy retargeting to updated design variants.

---

## 4. Geometry Preservation ("Preserve Size")

Update image pixel content on Miro canvas while preserving custom layout dimensions, manual crops, and widget aspect ratios.

<div className="my-6 aspect-video w-full overflow-hidden rounded-xl border border-border-card bg-bg-card shadow-sm">
  <iframe
    className="w-full h-full"
    src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"
    title="Geometry Preservation Demo"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</div>

* **Key Highlights:**
  * Preserves manual widget resizes and crop layouts.
  * Independent toggle per sync operation.

---

## 5. Vector SVG vs. HD PNG Resolution Control

Choose between crisp vector **SVG** exports (ideal for responsive text and icons with ~10x less bandwidth) or high-resolution **PNG** scaling (1x, 2x, and up to 4x for self-hosters).

<div className="my-6 aspect-video w-full overflow-hidden rounded-xl border border-border-card bg-bg-card shadow-sm">
  <iframe
    className="w-full h-full"
    src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"
    title="Vector SVG vs HD PNG Resolution Control Demo"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  ></iframe>
</div>

---

## Explore More Documentation

* [Quickstart Setup Guide](/docs/setup) — Learn how to set up SyncBoard in 2 minutes.
* [System Architecture](/docs/architecture) — Learn how SyncBoard's 3-layer adapter system works.
* [Frequently Asked Questions](/docs/faq) — Common questions about pricing, privacy, and self-hosting.
