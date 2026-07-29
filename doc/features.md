---
title: Features & Video Demos
description: Explore SyncBoard's core capabilities in action with short video walkthroughs, GIFs, and screenshots.
---

# SyncBoard Features & Video Demos

Explore how SyncBoard bridges design tools (**Figma** & **Penpot**) with interactive canvas whiteboards (**Miro**) in real time.

---

## Frame Selection & Detection Relay

SyncBoard's companion plugins stream active canvas selections in real time over **Ably WebSockets**. Selecting a frame in Figma Desktop/Web or Penpot instantly populates the Miro sidebar panel — with **zero server polling** and **zero Redis overhead**.

### Figma Walkthrough

<div className="my-6 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
  <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
</div>

### Penpot Walkthrough

<div className="my-6 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
  <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
</div>

* **Key Highlights:**
  * Active selection relay across open design tabs and companion plugins.
  * Direct WebSocket channel pairing (`penpot:${pairingId}`).
  * Password-masked pairing key security (`●●●●●●●●`).

---

## One-Click Sync & Multi-Copy Board Propagation

Update selected screens in-place on Miro canvas. Toggle **"Also update all board copies"** to automatically search the canvas and propagate screen updates across every duplicate widget simultaneously.

### Figma Walkthrough

<div className="my-6 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
  <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
</div>

### Penpot Walkthrough

<div className="my-6 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
  <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
</div>

* **Key Highlights:**
  * Single-click in-place screen updates.
  * Community batch protection (up to 3 unique images per sync).
  * Auto-refresh frame names directly from Figma/Penpot APIs.

---

## Widget Adoption & Retargeting ("Replace Selected")

Adopt any existing image widget on your Miro board (even non-SyncBoard imports or copy-pasted screenshots) or retarget an existing widget to a new Figma/Penpot frame **without changing widget IDs**.

### Figma Walkthrough

<div className="my-6 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
  <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
</div>

### Penpot Walkthrough

<div className="my-6 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
  <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
</div>

* **Key Highlights:**
  * Widget IDs remain intact.
  * Preserves canvas connectors, sticky note links, frame memberships, and comments.
  * Easy retargeting to updated design variants.

---

## Geometry Preservation ("Preserve Size")

Update image pixel content on Miro canvas while preserving custom layout dimensions, manual crops, and widget aspect ratios.

### Figma Walkthrough

<div className="my-6 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
  <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
</div>

### Penpot Walkthrough

<div className="my-6 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
  <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
</div>

* **Key Highlights:**
  * Preserves manual widget resizes and crop layouts.
  * Independent toggle per sync operation.

---

## Vector SVG vs. HD PNG Resolution Control

Choose between crisp vector **SVG** exports (ideal for responsive text and icons with ~10x less bandwidth) or high-resolution **PNG** scaling (1x, 2x, and up to 4x for self-hosters).

### Figma & Penpot Resolution Walkthrough

<div className="my-6 flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed border-border-card bg-bg-card p-6 text-center shadow-sm">
  <p className="text-sm font-medium text-text-muted text-center">Video Walkthrough Coming Soon</p>
</div>

---

## Password-Masked Pairing Key Security

To prevent unauthorized users on public whiteboards from reading your live design selection channel, SyncBoard uses cryptographically random **16-character Pairing IDs** (`pairingId.ts`).

In the Miro sidebar UI, the Pairing ID input field is masked (`●●●●●●●●`) with an interactive toggle button to reveal or copy the key securely.

```text
Pairing ID:  [ ●●●●●●●●●●●●●●●● ]  [ Reveal ]  [ Copy ]
```

* **Key Security Highlights:**
  * Generated client-side via `window.crypto.getRandomValues()`.
  * Input field defaults to password masking (`type="password"`).
  * 1-click reveal and copy controls for pairing with Figma or Penpot companions.

---

## Explore More Documentation

* [Quickstart Setup Guide](/docs/setup) — Learn how to set up SyncBoard in 2 minutes.
* [System Architecture](/docs/architecture) — Learn how SyncBoard's 3-layer adapter system works.
* [Frequently Asked Questions](/docs/faq) — Common questions about pricing, privacy, and self-hosting.
