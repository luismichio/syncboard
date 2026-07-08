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
3. Set the name to `SyncBoard` and set the Redirect URI to:
   `https://YOUR_SUBDOMAIN.YOUR_DOMAIN.com/api/oauth/figma/callback`
4. Under **Scopes**, select **`file_content:read`** (deprecated scopes like `file_read` or `files:read` should be avoided).
5. Click **Save** to create the app.
6. Copy the **Client ID** and generate a new client secret to copy the **Secret Value** (do not copy the Secret ID).

### 2. Register Miro Developer App
1. Go to your **Miro Profile Settings** -> **Developer Team** -> **Create new app**.
2. Set the App URL to:
   `https://YOUR_SUBDOMAIN.YOUR_DOMAIN.com/miro-plugin?init=true`
3. Under **OAuth 2.0 Settings**:
   * Set Redirect URI to: `https://YOUR_SUBDOMAIN.YOUR_DOMAIN.com/api/oauth/miro/callback`
   * Enable the checkbox: **"Use this URI for SDK Authorization"**
4. Enable the following scopes:
   * `boards:read`
   * `boards:write`
5. Click **Create App** and copy your **Client ID** and **Client Secret**.

### 3. Deploy to Vercel
1. Go to your **[Vercel Dashboard](https://vercel.com/dashboard)**.
2. Click **Add New** -> **Project**, and import your `syncboard` GitHub repository.
3. Under **Environment Variables**, configure these 5 key-value pairs:

| Variable | Value Example | Note |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://syncboard.yourdomain.com` | **Do NOT add a trailing slash** at the end. An extra `/` will result in double-slash redirect paths (like `//api/oauth/`), breaking the OAuth validation. |
| `FIGMA_CLIENT_ID` | `JjzbLKnyn462MQ...` | Your Figma Developer App Client ID |
| `FIGMA_CLIENT_SECRET` | `9WvdhTkvLesQB...` | Your Figma Developer App **Secret Value** |
| `MIRO_CLIENT_ID` | `307445736...` | Your Miro Developer App Client ID |
| `MIRO_CLIENT_SECRET` | `shLp5e9yR2...` | Your Miro Developer App Client Secret |

4. Click **Deploy**. Vercel will compile the build and generate your endpoint.

### 4. Custom Subdomain DNS Configuration (e.g. Squarespace)
To link your subdomain (like `syncboard.yourdomain.com`) to the Vercel project:
1. In your Vercel project settings, go to **Domains** -> Add `syncboard.yourdomain.com`.
2. Vercel will display a custom DNS target (e.g., `xxxxxx.vercel-dns-017.com` or `cname.vercel-dns.com`).
3. Log in to your domain registrar (e.g. **Squarespace**).
4. Go to **DNS Settings** for your domain and scroll to the custom records area.
5. Create a new record:
   * **Host:** `syncboard` (or your full subdomain string if required by the interface)
   * **Type:** `CNAME`
   * **Alias data / Points To / Value:** The DNS target value provided by Vercel.
6. Save the settings. DNS changes propagate within 5-15 minutes, after which your subdomain will be live under HTTPS.

---

## 🔗 Distributing a "Demo" / "Trial" Version
Because SyncBoard is database-free and secure, you can distribute a trial version so other designers and stakeholders can install it onto their boards without deploying their own server:

1. In your **Miro Developer Portal**, select your app.
2. Click **Share app** in the left sidebar menu.
3. Under **App Install Link**, copy the generated link.
4. Share this link on your portfolio, website, or team Slack workspace. 
5. Anyone who clicks the link can authorize and install the plugin on their board. When they log in to Figma/Miro, their credentials will be encrypted and saved in **their own browser storage**, allowing them to use your Vercel proxy with absolute privacy.

---

## 💻 Local Development

For testing and coding on your local machine:

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Configure local environment variables (`.env.local`):**
   ```env
   NEXT_PUBLIC_APP_URL=https://your-tunnel-subdomain.loca.lt
   FIGMA_CLIENT_ID=your_local_id
   FIGMA_CLIENT_SECRET=your_local_secret
   MIRO_CLIENT_ID=your_local_id
   MIRO_CLIENT_SECRET=your_local_secret
   FIGMA_PERSONAL_TOKEN=optional_local_token
   ```

3. **Expose localhost using `cloudflared` (Recommended - Zero Warning Pages):**
   ```bash
   npx @cloudflare/cloudflared tunnel --url http://localhost:3000
   ```
   *(Or using `npx localtunnel --port 3000 --subdomain your-subdomain`. Note: If using localtunnel, make sure you open the HTTPS url once in your browser tab to click the safety bypass button, otherwise localtunnel will block redirect query parameters during logins).*

4. **Start the development server:**
   ```bash
   yarn dev
   ```

---

## 📖 Usage Walkthrough

### 1. Connecting Accounts
Open your Miro board, load the SyncBoard sidebar panel, and click **Connect** for both Figma and Miro. Allow the popup permission inside your browser if requested.

### 2. Importing a Frame (Free Figma Plan Compatible)
* **Standard Link Method:** In Figma, click on any frame or design layer and press **`Ctrl + L`** (or **`Cmd + L`**) to copy the direct URL. Paste this link into the SyncBoard panel in Miro and click **Place on Canvas**.
* **Active Selection (Local MCP):** If your local Figma Desktop MCP companion is running, click **Detect Selection in Figma App** to pull the frame details automatically.

### 3. Syncing Board Screens
When you want to fetch updates:
1. Select one or more Figma frame images on your Miro canvas.
2. The sidebar panel (or the external dashboard tab) will display the selected items.
3. Click **Sync Selected Screens** to fetch the updated assets from Figma and overwrite the board images in-place.

---

## 🛠️ How it Works under the Hood

* **Decentralized Mapping:** When an image is created, we write a tag into its `title` parameter: `[SyncBoard|fileKey|nodeId] Node Name`.
* **Stateless Synchronization:** During a sync, the Miro sidebar retrieves all images on the canvas and filters for the `[SyncBoard|` signature. The serverless proxy retrieves the fresh frame render from Figma's REST API and uploads the binary payload as `multipart/form-data` directly to Miro's `PATCH` endpoint, overwriting the image content.
* **Auto-Authorization:** If a token expires, the client-side helper detects it and prompts the serverless `/api/oauth/refresh` endpoint to perform a secure backend exchange using client secrets.

---

## 📄 License

This project is open-source and licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for more details.
