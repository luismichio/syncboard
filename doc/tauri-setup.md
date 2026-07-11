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

## 🔑 2. Secure Local Loopback Certificates (Let's Encrypt)

Browsers restrict insecure connections from HTTPS environments like Miro. To run the loopback bridge without security prompts:

1. **Obtain Domain Certs:**
   * Register a subdomain that resolves to `127.0.0.1` (e.g. `local-syncboard.luiskobayashi.com`).
   * Generate wildcard or single-domain Let's Encrypt certificates for the subdomain (using Certbot/DNS challenge).
2. **Copy Certificates:**
   * Copy the generated `fullchain.pem` and `privkey.pem`.
   * Rename them to `cert.pem` and `key.pem`.
   * Place them inside:
     `tauri-bridge/src-tauri/resources/`
3. **Compile:**
   * When compiling (`yarn tauri build`), these keys are compiled directly into the binary via `include_bytes!`, keeping the application standalone and zero-configuration for end-users.

---

## 🚀 3. Automated GitHub Releases

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
