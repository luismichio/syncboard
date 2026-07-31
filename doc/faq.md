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

### What happens if I rename or move a frame in Figma or Penpot?
The next time you click **Sync** in Miro, SyncBoard automatically fetches the latest render and updates the widget title tag in Miro to match your new frame name. Position, dimensions, and scale in Miro remain intact.

---

## Technical Design & Constraints

### Why is connection metadata duplicated in the image titles?
SyncBoard stores metadata inside the structured registry (`image.getMetadata().syncboard`), but it also appends a tag like `[FigmaSync|fileKey|nodeId]` or `[PenpotSync|fileId|objectId]` to the widget title for three key reasons:
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

### Is the Figma Companion plugin required to import or sync screens?
**No.** The Figma Companion plugin is **only needed for auto-detecting your active selection** in Figma. You can import and sync screens directly into Miro by pasting Figma frame URLs into the Miro sidebar without installing the Figma Companion plugin.

### Does SyncBoard support two-way sync (editing in Miro and updating Figma)?
**No.** SyncBoard is strictly a **one-way sync engine** (Design Tool → Miro). Your design tool remains the single source of truth. This prevents accidental overwrites or corruption of primary design files by board collaborators.

### What happens to my Miro widgets if SyncBoard is uninstalled or offline?
All synced design screens remain on your Miro board as permanent, flat image widgets. They will **never break, disappear, or require a login to view**. Uninstalling the app only prevents triggering *new* sync updates.

### How does SyncBoard detect the Figma File Key?
SyncBoard automatically resolves the Figma `fileKey` through a multi-layered fallback system:
1. **Figma URL Import (Zero Setup):** When pasting a Figma URL into Miro, SyncBoard extracts the `fileKey` directly from the URL parameters (`figma.com/design/FILE_KEY/...`). No companion plugin or file linking is required.
2. **Native API Resolution:** In Figma environments, SyncBoard queries `figma.fileKey` automatically.
3. **Companion Document & Storage Cache:** If `figma.fileKey` is restricted by Figma's community privacy policies, the companion plugin uses the document's linked plugin data (`figma.root`) or `clientStorage` cache to remember your file key permanently across sessions.

### Does SyncBoard support Miro's native Desktop App?
**Yes.** Because SyncBoard has been fully migrated to use the cloud-based Ably Relay transport rather than native local loopback ports, the Miro sidebar plugin functions identically in both standard web browsers and Miro's native Electron desktop client. 

### Is it possible to use Ctrl+Z (Undo) in Miro to revert a sync or placement?
**No.** Programmatic image creations and binary replacements via the Miro REST API or Web SDK bypass Miro's native client-side Undo/Redo history buffer (`Ctrl+Z` / `Cmd+Z`). Hitting `Ctrl+Z` after a sync will either have no effect or undo an earlier manual user edit on the canvas. If you need to refresh or revert a synced image, click **Sync** again to pull a fresh render from your design tool.

### Which web browsers are supported for running the Penpot companion?
The Penpot companion plugin runs within Penpot's standard plugin iframe environment. It is fully supported in all modern evergreen browsers (Chrome, Edge, Firefox, Safari, and Brave). 
* *Note:* If you are using Brave or strict tracking protection in Firefox, ensure that third-party cookie/local storage blocking is relaxed for the Penpot and SyncBoard domains to allow Ably WebSocket connections and pairing ID persistence.

---

## Security, Privacy & Compliance

> [!NOTE]
> For complete security architecture details, sub-processor listings, and vulnerability disclosure policies, see our official [Security Policy](/docs/security) and [Privacy Policy](/docs/privacy).

### Is SyncBoard GDPR compliant?
**Yes.** SyncBoard is built on the principles of **Privacy by Design** and **Data Minimization**:
* **Zero Data Retention:** SyncBoard does not maintain a database and never stores design files, personal details, or credentials.
* **Client-Side Storage:** OAuth access tokens are stored securely in Miro's client-side board storage (which is sandboxed to the user's browser/Miro session), rather than on a remote server.
* **Stateless Proxying:** The application serves as a real-time data proxy. Since no personal data is harvested, stored, or processed on the server, it inherently complies with GDPR requirements. For full GDPR sub-processor details and rights requests, refer to our [Privacy Policy](/docs/privacy) and [Security Policy](/docs/security).

### Where are my Figma and Penpot design assets stored?
SyncBoard is **completely stateless**. It does not run a database and never caches your Figma or Penpot designs. The server acts purely as a secure proxy—fetching design files from the source API, rendering them on the fly, and piping them directly to Miro's image creation endpoints. Your design data remains strictly within Miro and your original design tool.

### How are my OAuth credentials secured?
OAuth access tokens are stored securely in your local Miro board storage (sandboxed to your account and team workspace) rather than on any remote database. SyncBoard uses cryptographic state tokens and secure HTTP-only cookies to validate OAuth redirects and protect against Cross-Site Request Forgery (CSRF).

### How secure are the cloud relay channels?
Relay channels are scoped using cryptographically random pairing IDs (`sb_xxxxx`). The Ably connection generates short-lived, subscribe-only authentication tokens scoped specifically to your pairing channel. This ensures that command relay traffic is private, secure, and cannot be intercepted or cross-talked between teams.

### Can I sync frames from private Figma Team or Enterprise workspaces?
**Yes.** Because SyncBoard uses **User-Owned OAuth**, it operates with the exact permissions of the personal Figma account you connect. As long as your account has read access to the private file, SyncBoard can render and sync its frames.

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

### What platform API limits do Figma, Penpot, and Miro enforce?
In addition to SyncBoard's gateway rate limits, each platform enforces its own upstream API quotas:
* **Figma REST API:** Figma limits image rendering requests per user token. If exceeded, Figma returns an `HTTP 429` with a `Retry-After` header. SyncBoard automatically detects 429 responses and displays a live **429 Cooldown** timer in the Miro sidebar UI.
* **Miro REST API & Web SDK:** Miro limits image updates to 50 requests/min per user token. SyncBoard enforces a batch size limit (max 3 images) and a 500ms delay between consecutive widget updates to prevent Miro rate blocks.
* **Penpot Companion Relay:** Penpot sync runs via event-driven WebAssembly inside the Penpot tab and streams selection events over Ably WebSockets, bypassing REST polling limits entirely.

> For a full technical breakdown of infrastructure quotas, token-hash keys, and rate limit configurations, see our [Security, Rate Limits & Quotas Architecture](/docs/architecture-security-and-limits).

### Is there a batch size limit?
Yes — the Community plan limits sync to **3 unique images per batch**. Different scales of the same frame count as 1 image. A warning banner appears in the sidebar when more than 3 images are selected, and the sync button is disabled. Self-host deployments can adjust this limit in the source code.

### Are there scale restrictions on the Community plan?
Yes — the Community plan limits export scale to **1x and 2x** only. Self-host deployments can use 1x–4x. This caps the worst-case export count at 3 frames × 2 scales = 6 renders per sync, protecting free-tier infrastructure from accidental overuse.

### Can I run SyncBoard offline or on-premise?
SyncBoard requires an internet connection to communicate with Figma, Penpot, and Miro cloud APIs. However, the codebase can be self-hosted on your own infrastructure (Vercel, Docker containers, AWS, etc.). The frontend utilizes system font fallbacks to ensure compilation and loading succeed smoothly in isolated or restricted corporate networks without relying on external CDN font fetches.

### What image format (PNG or SVG) should I choose?
* **PNG:** Best for complex vector layouts with heavy drop shadows, gradients, embedded images, or thousands of sub-nodes. PNGs are rendered on Figma's servers and imported as flat images, which keeps Miro board panning and zooming highly performant.
* **SVG:** Best for icons, simple line art, text blocks, and wireframes. SVGs scale infinitely without pixelation, but importing extremely large, complex SVGs can degrade Miro's canvas rendering speed.

### What filename is used when downloading synced images from Miro?
When right-clicking a synced widget in Miro and selecting **Download**, the file is saved using your design frame's actual name (e.g. `Login Screen.png` or `Header.svg`) rather than a generic `image.png`. SyncBoard automatically registers the named binary file header payload on Miro's asset servers during placement and sync.

### How does SyncBoard handle multiple copies of the same frame on a Miro board?
If a designer or PM duplicates a synced image widget across a Miro board (e.g. for user flows or annotations), SyncBoard detects all widgets sharing the same `[FigmaSync|fileKey|nodeId]` or `[PenpotSync|fileId|objectId]` signature. Instead of cluttering the sidebar with separate entries, SyncBoard consolidates them into a single management card displaying a copy counter badge (e.g. `x3`). Updating format, scale, or clicking "Sync" automatically updates all copies on the board simultaneously.

---

## Licensing, Governance & Dual-Licensing

### Why is SyncBoard licensed under AGPL-3.0?
SyncBoard is licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**, an OSI-approved copyleft license. Section 13 of AGPL-3.0 ensures that any modified or host-offered cloud versions of SyncBoard must share their source code back with the open-source community, protecting the project from proprietary SaaS exploitation.

### What is the Contributor License Agreement (CLA)?
SyncBoard uses a standard 1-click Contributor License Agreement (CLA) on pull requests. The CLA ensures that copyright ownership remains consolidated with the maintainer, enabling the project to offer commercial enterprise licenses to companies whose legal policies prohibit AGPL software.

### Can enterprises purchase a commercial license?
**No.** There is currently no paid or commercial purchase option available. SyncBoard is released open-source under the AGPL-3.0 license. However, if your enterprise organization is interested in custom commercial licensing or dedicated support, please reach out to **contact-syncboard@luiskobayashi.com**.
