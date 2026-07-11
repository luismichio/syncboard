# SyncBoard (Figma & Penpot to Miro Sync Engine)

SyncBoard is a stateless, open-source integration tool that lets product and design teams sync design screens from **Figma** and **Penpot** directly into Miro boards as lightweight, flat images. It prevents canvas clutter by updating images **in-place** (zero duplicates) using metadata tagged inside Miro's native `title` property.

Unlike official live embeds which require browser logins and degrade board performance, SyncBoard places fast-loading, flat images that stakeholders can annotate, draw on, and reference instantly.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fluismichio%2Fsyncboard&env=FIGMA_CLIENT_ID,FIGMA_CLIENT_SECRET,MIRO_CLIENT_ID,MIRO_CLIENT_SECRET,NEXT_PUBLIC_APP_URL)

---

## ✨ Features

* **In-Place Updates:** SyncBoard utilizes a custom `PATCH` update mechanism that replaces the binary image file of the Miro widget while keeping its position, dimensions, rotation, and parent frames intact.
* **Consolidated Selection & Copies Counter:** Group duplicates of the same frame inside the sidebar under a single card, displaying a count badge (e.g., `x3`) in the top-right. Updating scale or format updates all copies simultaneously.
* **Dual-Platform Sync:** Supports **Figma** (cloud-native sync) and **Penpot** (local loopback bridge sync) side-by-side.
* **Zero-Setup Figma Sync:** Connects to Figma's public API to render and update screens in the cloud with no local servers or databases required.
* **SyncBridge Companion (For Figma & Penpot):** Connects Miro Desktop (Electron) to local Figma servers and Penpot browser tabs securely using a local secure HTTPS loopback server, bypassing browser mixed-content restrictions with no tunnels.

### 📐 Integration & Compatibility Matrix

Depending on your design tool and Miro client, here is when the local **SyncBridge** companion app is required:

| Feature | Design Tool Context | Miro Client | SyncBridge Required? |
| :--- | :--- | :--- | :--- |
| **Figma URL Import / Sync** | Browser or Desktop | Browser or Desktop | **No** (Cloud-Native Sync) |
| **Figma Auto-Detect Selection** | Figma Desktop | Miro Desktop | **Yes** (Queries local port 3845) |
| **Penpot URL Import & Selection** | Penpot Browser | Miro Desktop | **Yes** (Relays render & selection to Penpot tab) |
| **Figma / Miro Login (OAuth)** | Any browser | Browser or Desktop | **No** (Uses stateless polling) |

---

## 🚀 Setup & Deployment

### 1. Register Figma Developer App
1. Go to the Figma Developer Portal: **[https://www.figma.com/developers/apps](https://www.figma.com/developers/apps)**.
2. Click **Create a new app**.
3. Choose a custom name for your app (e.g., `MySyncBoard` or `Custom-Sync-Engine`). *To comply with the branding guidelines, do not name public/distributed apps exactly `SyncBoard`.*
4. Set the Redirect URI to:
   `https://YOUR_DOMAIN.com/api/oauth/figma/callback`
5. Under **Scopes**, select **`file_content:read`**.
6. Copy the **Client ID and Secret**.

### 2. Register Miro Developer App
1. Go to your **Miro Profile Settings** -> **Developer Team** -> **Create new app**. Give it a custom name.
2. Set the App URL to:
   `https://YOUR_DOMAIN.com/miro-plugin?init=true`
3. Under **OAuth 2.0 Settings**:
   * Set Redirect URI to: `https://YOUR_DOMAIN.com/api/oauth/miro/callback`
   * Enable the checkbox: **"Use this URI for SDK Authorization"**
4. Enable the following scopes:
   * `boards:read`
   * `boards:write`
5. Click **Create App** and copy your **Client ID** and **Client Secret**.

### 3. Deploy to Vercel
1. Go to your Vercel Dashboard, import your `syncboard` repository, and configure these environment variables:
   | Variable | Value Example | Note |
   | :--- | :--- | :--- |
   | `NEXT_PUBLIC_APP_URL` | `https://syncboard.yourdomain.com` | Do **NOT** add a trailing slash. |
   | `FIGMA_CLIENT_ID` | `...` | From Figma Portal |
   | `FIGMA_CLIENT_SECRET` | `...` | From Figma Portal |
   | `MIRO_CLIENT_ID` | `...` | From Miro Portal |
   | `MIRO_CLIENT_SECRET` | `...` | From Miro Portal |
2. Click **Deploy**.

---

## 📐 Architecture & Specifications

For details on how the system handles secure local loopbacks, DNS routing, metadata formats, and API rate limits, please refer to the dedicated **[SyncBoard Architecture Documentation](./doc/architecture.md)**.

---

## 🎨 Penpot Plugin Setup

To use SyncBoard with **Penpot**, you need to install the SyncBoard Companion Plugin in your Penpot workspace:

### Production Installation
1. In Penpot, open any design file.
2. In the right-hand panel, click the **Plugins** tab (puzzle icon).
3. Locate the plugin insertion section at the bottom of the tab.
4. Paste the secure manifest URL inside the URL input field:
   ```
   https://syncboard.luiskobayashi.com/penpot-manifest.json
   ```
5. Click **Install**. The plugin will appear in your workspace list.
6. Click the plugin to open it, connect to SyncBridge using your Pairing ID, and start syncing!

### Local Development Installation
When running the development server locally:
1. Follow the steps above to add a new plugin.
2. For the Manifest URL, use your local address:
   ```
   http://localhost:3000/penpot-manifest.json
   ```

### Troubleshooting: DNS Rebinding Protection (`ERR_NAME_NOT_RESOLVED`)
Some routers or corporate DNS servers block public domains from resolving to local loopback addresses (like `127.0.0.1`). If you see a `net::ERR_NAME_NOT_RESOLVED` error in your browser console when launching the Penpot plugin:
* Add a local mapping to your system's `hosts` file:
  * **Windows:** Append `127.0.0.1 local-syncboard.luiskobayashi.com` to `C:\Windows\System32\drivers\etc\hosts` (run your text editor as Administrator).
  * **macOS / Linux:** Run `sudo sh -c 'echo "127.0.0.1 local-syncboard.luiskobayashi.com" >> /etc/hosts'` in your terminal.

---

## 💻 Local Development

For testing and coding on your local machine:
1. **Install dependencies:**
   ```bash
   yarn install
   ```
2. **Configure local environment variables (`.env.local`):**
   ```env
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   FIGMA_CLIENT_ID=your_local_id
   FIGMA_CLIENT_SECRET=your_local_secret
   MIRO_CLIENT_ID=your_local_id
   MIRO_CLIENT_SECRET=your_local_secret
   ```
3. **Expose localhost using `cloudflared`:**
   ```bash
   npx @cloudflare/cloudflared tunnel --url http://localhost:3000
   ```
4. **Start the development server:**
   ```bash
   yarn dev
   ```

---

## 📄 License
This project is open-source and licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for more details.
