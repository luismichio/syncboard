---
title: Frequently Asked Questions (FAQ)
description: Answers to common questions about SyncBoard real-time collaboration, metadata signatures, network constraints, security, and self-hosting.
---

# Frequently Asked Questions (FAQ)

## Concurrency & Collaboration

### Can multiple team members sync the same image?
**Yes.** SyncBoard is entirely stateless. When a team member imports a design frame onto the Miro board, all sync metadata (such as the Figma/Penpot file key, node ID, scale, and format) is stored directly on the Miro image widget itself (in its title and custom metadata fields). 

Any other team member who selects that widget in Miro will see the active connection status in their sidebar and can trigger a sync to pull the latest changes, provided their authenticated Figma/Penpot account has permission to read the source design file.

### How are concurrent sync operations on the same widget resolved?
If two users click "Sync" at the exact same moment on the same widget, both requests will query the design tool APIs and send updates to Miro. Miro handles concurrent updates gracefully via its collaborative Operational Transformation (OT) engine—the last sync request to complete will apply its visual payload, and the widget will update without any database locks or corruption.

### How do collaborative permissions affect who can view or sync images?
* **Viewing:** Anyone who has access to the Miro board can view the synced design images. They do not need a Figma/Penpot account or the SyncBoard plugin installed to view the images on the board.
* **Syncing:** To update a synced image, a user must have the SyncBoard plugin installed and configured, and their authenticated design tool account must have read permissions for the specific Figma/Penpot file.

---

## Technical Design & Constraints

### Why is connection metadata duplicated in the image titles?
SyncBoard stores metadata inside the structured registry (`image.getMetadata().syncboard`), but it also appends a tag like `[SyncBoard|fileKey|nodeId]` to the widget title for three key reasons:
1. **Durable Copy/Paste Fallback:** When widgets are copied and pasted across different boards or by different users, custom plugin-sandboxed metadata can sometimes be stripped by Miro. Standard text titles are native to the widget and are guaranteed to persist. The plugin uses title-based regex matching as its primary detection route.
2. **Native Board Searchability:** Miro's search bar indexes standard widget text (including titles) but does not index custom plugin metadata. Having the signature in the title allows users to easily search the board for specific Figma or Penpot frames.
3. **Human-Readable Auditing:** It provides an immediate visual way for designers and developers to see exactly which source frame a screenshot belongs to without opening developer tools.

### Why does the Penpot companion use Ably WebSockets?
Chrome's **Private Network Access (PNA)** security policy prevents public websites (like Miro's plugin iframe or Penpot's editor) from making direct HTTP or WebSocket connections to local loopback addresses (like `127.0.0.1:4401` or `localhost`). 

To bypass this browser block, SyncBoard uses a secure cloud relay pathway (Ably Realtime WebSockets + Upstash Redis). The companion plugin subscribes to a secure Ably channel matching its pairing ID, receives commands published by the Miro plugin via the `/api/relay/request` proxy endpoint, and posts the resulting design assets back to the cloud relay.

### Why do I get a "Penpot companion is offline" error?
Penpot plugins run entirely inside the designer's browser tab. If that tab is closed, or if the companion plugin is not actively open and connected, the Ably connection closes. To solve this, open the Penpot editor tab containing your designs, launch the **SyncBoard Companion** plugin, verify it shows a "Connected" status, and ensure the pairing ID matches the one shown in your Miro sidebar.

### Do I need the Tauri desktop app (SyncBridge) to auto-detect my Figma selection?
**No.** While the Tauri desktop app can act as a local capability extender (e.g. for native figma client selection querying), you can now use the **Figma Companion Plugin** directly inside the Figma editor. The companion plugin uses Ably WebSockets to broadcast selection events directly from Figma to the Miro sidebar over the cloud relay, meaning it works entirely within the web browser without any local servers or desktop apps.

### Why do I need to manually link my Figma files in the Community Companion plugin?
**Because of Figma's API privacy boundaries.**

Figma's `figma.fileKey` API (which retrieves the active file's unique ID automatically) is restricted for security reasons. Figma only allows this API to run in **private plugins** installed inside a Figma Organization workspace (which you can enable by adding `"enablePrivatePluginApi": true` in your self-hosted `manifest.json`). 

In the public Figma Community plugin, this API is blocked and returns `undefined`. Without a file key, the Figma REST API cannot query frames, leading to a `403 Forbidden` error. 

To solve this, the plugin saves the link key directly inside the document metadata (`figma.root.setPluginData`). 
1. When you open a Figma file for the first time, the companion will show a **"Pair Figma Design File"** input box.
2. Paste the URL of your Figma file once and click **Link**. 
3. The plugin links the file key to that specific document. Figma will remember this link permanently for that file, and selection auto-detect will work immediately without any further configuration. You can link as many files as you want without conflict.

### Does SyncBoard support Miro's native Desktop App?
**Yes.** Because SyncBoard has been fully migrated to use the cloud-based Ably Relay transport rather than native local loopback ports, the Miro sidebar plugin functions identically in both standard web browsers and Miro's native Electron desktop client. 

### Which web browsers are supported for running the Penpot companion?
The Penpot companion plugin runs within Penpot's standard plugin iframe environment. It is fully supported in all modern evergreen browsers (Chrome, Edge, Firefox, Safari, and Brave). 
* *Note:* If you are using Brave or strict tracking protection in Firefox, ensure that third-party cookie/local storage blocking is relaxed for the Penpot and SyncBoard domains to allow Ably WebSocket connections and pairing ID persistence.

---

## Security, Privacy & Compliance

### Is SyncBoard GDPR compliant?
**Yes.** SyncBoard is built on the principles of **Privacy by Design** and **Data Minimization**:
* **Zero Data Retention:** SyncBoard does not maintain a database and never stores design files, personal details, or credentials.
* **Client-Side Storage:** OAuth access tokens are stored securely in Miro's client-side board storage (which is sandboxed to the user's browser/Miro session), rather than on a remote server.
* **Stateless Proxying:** The application serves as a real-time data proxy. Since no personal data is harvested, stored, or processed on the server, it inherently complies with GDPR requirements.

### Where are my Figma and Penpot design assets stored?
SyncBoard is **completely stateless**. It does not run a database and never caches your Figma or Penpot designs. The server acts purely as a secure proxy—fetching design files from the source API, rendering them on the fly, and piping them directly to Miro's image creation endpoints. Your design data remains strictly within Miro and your original design tool.

### How are my OAuth credentials secured?
OAuth access tokens are stored securely in your local Miro board storage (sandboxed to your account and team workspace) rather than on any remote database. SyncBoard uses cryptographic state tokens and secure HTTP-only cookies to validate OAuth redirects and protect against Cross-Site Request Forgery (CSRF).

### How secure are the cloud relay channels?
Relay channels are scoped using cryptographically random pairing IDs (`sb_xxxxx`). The Ably connection generates short-lived, subscribe-only authentication tokens scoped specifically to your pairing channel. This ensures that command relay traffic is private, secure, and cannot be intercepted or cross-talked between teams.

---

## Deployment, Costs & Rate Limits

### How much does it cost to host and run SyncBoard?
SyncBoard is extremely cost-effective and can be run entirely on **free tiers**:
* **Serverless Hosting:** Deployable on Vercel's Hobby tier (free) or Pro tier.
* **Cloud Relay (Ably):** Ably's free tier provides 6,000,000 monthly messages and 200 concurrent connections, which easily accommodates small-to-medium design teams.
* **Cache & Rate Limiting (Upstash):** Upstash Redis offers a free tier of 10,000 commands/day, which is plenty for temporary OAuth caching and rate limit tracks.

### What are the rate limits, and why do they exist?
SyncBoard implements sliding-window rate limits (configurable via environment variables) for the public community demo. These exist to **protect the shared infrastructure and prevent resource abuse**:

* **Infra Protection & Abuse Prevention:** The public community version runs on shared cloud hosting (Vercel, Ably, and Upstash Redis). The rate limiter prevents malicious actions, such as automated token rotation or denial-of-service (DoS) attacks, that could exhaust the community instance's hosting budgets and disrupt service for all users.
* **API Quota Management:** Throttling requests at the gateway level ensures a single user's heavy batch sync does not exhaust the shared Figma/Miro API quotas, which would otherwise trigger global rate blocks (HTTP 429) for the entire community.
* **Self-Host Customization:** For teams deploying SyncBoard on their own private infrastructure (e.g. self-hosting on enterprise Vercel or local Docker instances), these limits can be fully managed, adjusted, or entirely disabled (`RATE_LIMIT_ENABLED=false` in the environment configuration) to suit their internal team requirements.

### What are the default rate limit values?
| Endpoint | Community Default | Self-Host (Env Override) |
|---|---|---|
| Figma renders per minute | 12 | `RATE_LIMIT_COMMUNITY_FIGMA_PER_MIN` |
| Figma renders per day | 50 | `RATE_LIMIT_COMMUNITY_FIGMA_PER_DAY` |
| Relay selections per minute | 5 | `RATE_LIMIT_COMMUNITY_RELAY_PER_MIN` |
| Relay selections per hour | 30 | `RATE_LIMIT_COMMUNITY_RELAY_PER_HOUR` |
| Relay results per day | 100 | `RATE_LIMIT_COMMUNITY_RELAY_PER_DAY` |
| Miro image updates per minute | 30 | `RATE_LIMIT_COMMUNITY_UPDATE_IMAGE_PER_MIN` |
| Ably token requests per minute | 5 | `RATE_LIMIT_COMMUNITY_ABLY_TOKEN_PER_MIN` |
| Global syncs per day | 500 | `RATE_LIMIT_COMMUNITY_GLOBAL_SYNCS_PER_DAY` |
| Global bandwidth per day | 500 MB | `RATE_LIMIT_COMMUNITY_GLOBAL_BANDWIDTH_MB_PER_DAY` |

### Is there a batch size limit?
Yes — the Community plan limits sync to **3 unique images per batch**. Different scales of the same frame count as 1 image. A warning banner appears in the sidebar when more than 3 images are selected, and the sync button is disabled. Self-host deployments can adjust this limit in the source code.

### Are there scale restrictions on the Community plan?
Yes — the Community plan limits export scale to **1x and 2x** only. Self-host deployments can use 1x–4x. This caps the worst-case export count at 3 frames × 2 scales = 6 renders per sync, protecting free-tier infrastructure from accidental overuse.

### Can I run SyncBoard offline or on-premise?
SyncBoard requires an internet connection to communicate with Figma, Penpot, and Miro cloud APIs. However, the codebase can be self-hosted on your own infrastructure (Vercel, Docker containers, AWS, etc.). The frontend utilizes system font fallbacks to ensure compilation and loading succeed smoothly in isolated or restricted corporate networks without relying on external CDN font fetches.

### What image format (PNG or SVG) should I choose?
* **PNG:** Best for complex vector layouts with heavy drop shadows, gradients, embedded images, or thousands of sub-nodes. PNGs are rendered on Figma's servers and imported as flat images, which keeps Miro board panning and zooming highly performant.
* **SVG:** Best for icons, simple line art, text blocks, and wireframes. SVGs scale infinitely without pixelation, but importing extremely large, complex SVGs can degrade Miro's canvas rendering speed.

### Why does downloading synced images from Miro save with the frame's name instead of `image.png`?
When an image is first placed in Miro via the Web SDK, Miro defaults the downloadable file asset name to `image.png` or `image.svg`. Immediately after placement or sync, SyncBoard executes a non-blocking background registration call (`/api/miro/update-image`) that uploads a named binary `File` header object (`${frameName}.png`). Miro reads this header and updates its asset manager so that right-clicking and downloading the image from Miro saves it with the exact frame title (e.g. `Login Screen.png`).

### How does SyncBoard handle multiple copies of the same frame on a Miro board?
If a designer or PM duplicates a synced image widget across a Miro board (e.g. for user flows or annotations), SyncBoard detects all widgets sharing the same `[SyncBoard|fileKey|nodeId]` signature. Instead of cluttering the sidebar with separate entries, SyncBoard consolidates them into a single management card displaying a copy counter badge (e.g. `x3`). Updating format, scale, or clicking "Sync" automatically updates all copies on the board simultaneously.

---

## Licensing, Governance & Dual-Licensing

### Why is SyncBoard licensed under AGPL-3.0?
SyncBoard is licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**, an OSI-approved copyleft license. Section 13 of AGPL-3.0 ensures that any modified or host-offered cloud versions of SyncBoard must share their source code back with the open-source community, protecting the project from proprietary SaaS exploitation.

### What is the Contributor License Agreement (CLA)?
SyncBoard uses a standard 1-click Contributor License Agreement (CLA) on pull requests. The CLA ensures that copyright ownership remains consolidated with the maintainer, enabling the project to offer commercial enterprise licenses to companies whose legal policies prohibit AGPL software.

### Can enterprises purchase a commercial license?
**Yes.** For enterprise organizations that require proprietary deployment without AGPL copyleft obligations or public source-code disclosure, a commercial enterprise license is available. Contact the maintainer for details.
