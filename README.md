# SyncBoard 🔄 (Figma-Miro Sync Engine)

SyncBoard is a stateless, open-source integration tool that lets product and design teams sync Figma frames directly into Miro boards as lightweight, flat images. It prevents canvas clutter by updating images **in-place** (zero duplicates) using metadata tagged inside Miro's native `title` property.

Unlike official live embeds which require browser logins and degrade board performance, SyncBoard places fast-loading, flat images that stakeholders can annotate, draw on, and reference instantly.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fsyncboard&env=FIGMA_CLIENT_ID,FIGMA_CLIENT_SECRET,MIRO_CLIENT_ID,MIRO_CLIENT_SECRET,NEXT_PUBLIC_APP_URL)

---

## ✨ Features

* **Zero-Database (Stateless):** OAuth access tokens are stored securely in the user's browser session. Your server handles zero database requests or persistent credentials, making it 100% free and simple to self-deploy.
* **In-Place Updates:** SyncBoard utilizes a custom `PATCH` update mechanism that replaces the binary image file of the Miro widget while keeping its position, dimensions, rotation, and parent frames intact.
* **Auto-Propagation:** Duplicated a screenshot on a Miro board? Because Miro copies the item metadata on duplication, a single click will update **every copy** of that frame across the board simultaneously.
* **Real-time Figma Selection (Figma Dev Mode Desktop MCP):** Detects what frame you currently have active in the Figma Desktop App, allowing one-click imports directly onto the Miro canvas.
* **Cross-Tab Sync:** Uses the browser `BroadcastChannel` API to link your Miro board tab and a standalone dashboard tab in real-time with 0ms server latency.

---

## 🚀 Setup & Deployment

### 1. Register Figma Developer App
1. Go to the Figma Developer Portal: **[https://www.figma.com/developers/apps](https://www.figma.com/developers/apps)**.
2. Click **Create a new app** (or **Register a new client**).
3. Set the name to `SyncBoard` and the Redirect URI to:
   `https://YOUR_DEPLOYMENT_URL.vercel.app/api/oauth/figma/callback`
4. Under scopes, select **`file_content:read`**.
5. Copy your **Client ID** and **Client Secret**.

### 2. Register Miro Developer App
1. Go to your **Miro Profile Settings** -> **Developer Team** -> **Create new app**.
2. Set the App URL to:
   `https://YOUR_DEPLOYMENT_URL.vercel.app/miro-plugin?init=true`
3. Under **OAuth 2.0 Settings**:
   * Set Redirect URI to: `https://YOUR_DEPLOYMENT_URL.vercel.app/api/oauth/miro/callback`
   * Enable checkbox: **"Use this URI for SDK Authorization"**
4. Enable the following scopes:
   * `boards:read`
   * `boards:write`
5. Copy your **Client ID** and **Client Secret**.

### 3. Deploy to Vercel
Click the Vercel Deploy button above or configure a manual project pointing to your fork. Add the following **Environment Variables**:

| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | Your deployment base URL (e.g. `https://your-app.vercel.app`) |
| `FIGMA_CLIENT_ID` | Your Figma Developer App Client ID |
| `FIGMA_CLIENT_SECRET` | Your Figma Developer App Client Secret |
| `MIRO_CLIENT_ID` | Your Miro Developer App Client ID |
| `MIRO_CLIENT_SECRET` | Your Miro Developer App Client Secret |

---

## 💻 Local Development

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

3. **Expose localhost using `ngrok` (required for OAuth redirect callbacks):**
   ```bash
   ngrok http 3000
   ```
   *Note: Update the redirect URIs in both Figma and Miro settings to match your temporary ngrok URL (e.g., `https://xxxx.ngrok-free.app`).*

4. **Start the development server:**
   ```bash
   yarn dev
   ```

---

## 🛠️ How it Works under the Hood

* **Decentralized Mapping:** When an image is created, we write a tag into its `title` parameter: `[SyncBoard|fileKey|nodeId] Node Name`.
* **Stateless Synchronization:** During a sync, the Miro sidebar retrieves all images on the canvas and filters for the `[SyncBoard|` signature. The serverless proxy retrieves the fresh frame render from Figma's REST API and uploads the binary payload as `multipart/form-data` directly to Miro's `PATCH` endpoint, overwriting the image content.
* **Auto-Authorization:** If a token expires, the client-side helper detects it and prompts the serverless `/api/oauth/refresh` endpoint to perform a secure backend exchange using client secrets.

---

## 📄 License

This project is open-source and licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for more details.
