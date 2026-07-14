# 🦀 Tauri Bridge Local Setup & Deployment

This document provides setup instructions for running, code-signing, and compiling the **SyncBoard Local Desktop Bridge** application.

---

## 🛠️ 1. Local Development Setup

To run the Tauri application locally on your computer:

1. **Install Prerequisites:**
   * **Node.js & Yarn** (installed already)
   * **Rust toolchain:** Install via **[rustup.rs](https://rustup.rs/)**.
   * **OS Toolkits:**
     * **Windows:** C++ build tools (via Visual Studio Installer).
     * **macOS:** Xcode Command Line Tools (`xcode-select --install`).
     * **Linux:** Install system libraries (webkit, ssl, etc.):
       ```bash
       sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev
       ```
2. **Build and Run:**
   ```bash
   cd tauri-bridge
   yarn install
   yarn tauri dev
   ```

---

## 🔑 2. Secure Local Loopback Certificate Setup (mkcert)

Miro runs on `https://miro.com`. Browsers block insecure connections (`http://`) from HTTPS pages as **mixed content**. To allow SyncBridge to serve a trusted secure HTTPS endpoint on localhost without browser warnings, you must generate a locally-trusted TLS certificate.

SyncBoard uses `mkcert` — a zero-configuration tool that creates certificates signed by a local Certificate Authority (CA) that it installs into your system's trust store. No manual certificate authority setup is required.

> **Important:** The `cert.pem` and `key.pem` files are machine-specific and are excluded from git via `.gitignore`. Every developer must generate their own copy.

---

### Step 1 — Install `mkcert`

**Windows:**
```powershell
winget install FiloSottile.mkcert
```
Then restart your terminal to update `PATH`.

**macOS:**
```bash
brew install mkcert
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install libnss3-tools
wget -O mkcert https://github.com/FiloSottile/mkcert/releases/latest/download/mkcert-v1.4.4-linux-amd64
chmod +x mkcert
sudo mv mkcert /usr/local/bin/
```

---

### Step 2 — Install the Local CA (One-time per machine)

This installs mkcert's Certificate Authority into your system trust store so that any certificates it generates are automatically trusted by your OS, browsers, and Rust/TLS libraries:

```bash
mkcert -install
```

You only need to do this **once per machine**. You may be prompted for administrator/sudo access.

---

### Step 3 — Generate the Certificate

Navigate to the Tauri resources directory and generate the certificate for the SyncBoard loopback domain:

```bash
cd tauri-bridge/src-tauri/resources

mkcert \
  -cert-file cert.pem \
  -key-file key.pem \
  local-syncboard.luiskobayashi.com \
  127.0.0.1 \
  localhost
```

**Windows (PowerShell):**
```powershell
cd tauri-bridge\src-tauri\resources

mkcert -cert-file cert.pem -key-file key.pem local-syncboard.luiskobayashi.com 127.0.0.1 localhost
```

You should see output confirming:
```
Created a new certificate valid for the following names:
 - "local-syncboard.luiskobayashi.com"
 - "127.0.0.1"
 - "localhost"
The certificate is at "cert.pem" and the key at "key.pem"
```

---

### Step 4 — Rebuild the Tauri App

The certificates are compiled directly into the binary via `include_bytes!`. After placing the new files, rebuild the app:

```bash
cd tauri-bridge
yarn tauri build
```

Or run in development mode:

```bash
yarn tauri dev
```

> **Do not commit `cert.pem` or `key.pem` to git.** They are already excluded by `.gitignore` via the `*.pem` rule. Each developer generates their own locally-trusted pair.

---

## 🌐 3. DNS Loopback Record Setup

SyncBoard uses a public DNS A record that resolves to `127.0.0.1` (the local loopback interface). This is necessary because browsers block connections from `https://` pages to plain `http://localhost` as mixed content — but a domain with a valid TLS cert bypasses this restriction securely.

The public record is:
* **Domain:** `local-syncboard.luiskobayashi.com`
* **Type:** `A`
* **Value:** `127.0.0.1`

### If you are forking this project with your own domain

1. Log into your DNS provider and add a new A record:
   * **Host/Name:** `local-syncboard` (or any subdomain you prefer, e.g. `local-syncboard`)
   * **Type:** `A`
   * **Value:** `127.0.0.1`
   * **TTL:** 3600 (or provider default)

   > **Note:** Squarespace DNS does not accept dots (`.`) in the Host field. Use a dash (`-`) as a separator (e.g. `local-syncboard`) instead of `local.syncboard`.

2. Update all references to `local-syncboard.luiskobayashi.com` in the codebase to your chosen subdomain:
   * `public/penpot-companion-ui.html`
   * `src/app/miro-plugin/penpotMcpClient.ts`
   * `tauri-bridge/index.html`
   * `tauri-bridge/src-tauri/src/lib.rs` (comment only)

3. Regenerate your `cert.pem` / `key.pem` for your new domain name (Step 3 above).

### Troubleshooting: DNS Rebinding Protection

Some routers and corporate DNS servers block public domains from resolving to private/loopback addresses. If the Penpot plugin shows `ERR_NAME_NOT_RESOLVED` even after the DNS record is set, add a manual override to your system's `hosts` file:

**Windows** (run Notepad as Administrator, open `C:\Windows\System32\drivers\etc\hosts`):
```
127.0.0.1 local-syncboard.luiskobayashi.com
```

**macOS / Linux:**
```bash
sudo sh -c 'echo "127.0.0.1 local-syncboard.luiskobayashi.com" >> /etc/hosts'
```

Then flush your DNS cache:
* **Windows:** `ipconfig /flushdns`
* **macOS:** `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
* **Chrome/Edge:** Visit `chrome://net-internals/#dns` → click **Clear host cache**

---

## 🚀 4. Automated GitHub Releases

SyncBoard includes a GitHub Actions CI/CD pipeline to compile installer packages automatically when you release new versions:

### To trigger a release:
1. Increment the version number inside `tauri-bridge/src-tauri/tauri.conf.json` and `tauri-bridge/package.json`.
2. Commit and push your changes to GitHub.
3. Tag the commit with your version (prefixed with `v`):
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. GitHub Actions will spin up Windows, macOS, and Linux runners to package:
   * **Windows:** `.msi` and `.exe` installers.
   * **macOS:** `.dmg` and `.app` bundles.
   * **Linux:** `.deb` and `.AppImage` packages.
5. The assets will be uploaded automatically to a new **Draft Release** on your repository. You can verify, write release details, and publish it!

> **Note:** For CI/CD releases, the `cert.pem` and `key.pem` files must be provided as **GitHub Actions Secrets** and written to `tauri-bridge/src-tauri/resources/` during the build step. See `.github/workflows/` for the existing pipeline configuration.
