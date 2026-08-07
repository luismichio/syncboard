---
title: Features & Video Demos
description: Explore SyncingBoard's core capabilities in action with short video walkthroughs, GIFs, and screenshots.
---

# SyncingBoard Features & Video Demos

Explore how SyncingBoard bridges design tools (**Figma** & **Penpot**) with interactive canvas whiteboards (**Miro**) in real time.

---

## Getting Started - Figma & Penpot Setup

Set up **SyncingBoard** by installing the **Miro** app, then setting up **Figma** and **Penpot**.

<VideoTabs figma="https://www.youtube-nocookie.com/embed/pO_-icohQhQ" penpot="https://www.youtube-nocookie.com/embed/qEVvAl1ohoE" />

---

## Frame Selection & Detection Relay

SyncingBoard's companion plugins stream active canvas selections in real time over **Ably WebSockets**. Selecting a frame in Figma Desktop/Web or Penpot instantly populates the Miro sidebar panel - with **zero server polling** and **zero Redis overhead**.

<VideoTabs figma="coming-soon" penpot="coming-soon" />

* **Key Highlights:**
  * Active selection relay across open design tabs and companion plugins.
  * Direct WebSocket channel pairing (`penpot:${pairingId}`).
  * Multi-selection grouping in the sidebar.

---

## One-Click Sync & Multi-Copy Board Propagation

Update selected screens in-place on Miro canvas. Toggle **"Also update all board copies"** to automatically search the canvas and propagate screen updates across every duplicate widget simultaneously.

<VideoTabs figma="coming-soon" penpot="coming-soon" />

* **Key Highlights:**
  * Single-click in-place screen updates.
  * Community batch protection (up to 3 unique images per sync).
  * Auto-refresh frame names directly from Figma/Penpot APIs.

---

## Widget Adoption & Retargeting ("Replace Selected")

Adopt any existing image widget on your Miro board (even non-SyncingBoard imports or copy-pasted screenshots) or retarget an existing widget to a new Figma/Penpot frame **without changing widget IDs**.

<VideoTabs figma="coming-soon" penpot="coming-soon" />

* **Key Highlights:**
  * Widget IDs remain intact.
  * Preserves canvas connectors, sticky note links, frame memberships, and comments.
  * Easy retargeting to updated design variants.

---

## Geometry Preservation ("Preserve Size")

Update image pixel content on Miro canvas while preserving custom layout dimensions, manual crops, and widget aspect ratios.

<VideoTabs figma="coming-soon" penpot="coming-soon" />

* **Key Highlights:**
  * Preserves manual widget resizes and crop layouts.
  * Independent toggle per sync operation.

---

## Vector SVG vs. HD PNG Resolution Control

Choose between crisp vector **SVG** exports (ideal for responsive text and icons with ~10x less bandwidth) or high-resolution **PNG** scaling (1x, 2x, and up to 4x for self-hosters).

<VideoTabs figma="coming-soon" penpot="coming-soon" />

---

## Password-Masked Pairing Key Security

To prevent unauthorized users on public whiteboards from reading your live design selection channel, SyncingBoard uses cryptographically random **16-character Pairing IDs** (`pairingId.ts`).

In the Miro sidebar UI, the Pairing ID input field is masked (`????????`) with an interactive toggle button to reveal or copy the key securely.

```text
Pairing ID:  [ ???????????????? ]  [ Reveal ]  [ Copy ]
```

* **Key Security Highlights:**
  * Generated client-side via `window.crypto.getRandomValues()`.
  * Input field defaults to password masking (`type="password"`).
  * 1-click reveal and copy controls for pairing with Figma or Penpot companions.

---

## Explore More Documentation

* [Quickstart Setup Guide](/docs/setup) - Learn how to set up SyncingBoard in 2 minutes.
* [System Architecture](/docs/architecture) - Learn how SyncingBoard's 3-layer adapter system works.
* [Frequently Asked Questions](/docs/faq) - Common questions about pricing, privacy, and self-hosting.
