# Task Plan: Testing Setup & Security Auditing

Track active implementation checklist for codebase quality, security, testing, and pre-push hooks.

---

## 📅 Active Checklist

### Phase 1: Test Infrastructure Setup (Vitest)
- [x] Install testing dependencies: `vitest` and `jsdom` as dev dependencies.
- [x] Configure `vitest.config.ts` to support TypeScript paths (e.g. `@/*`) and set up the browser `jsdom` environment.
- [x] Write unit tests for `src/app/miro-plugin/figmaUrlParser.ts` (verify URL parsing and key/node extracting).
- [x] Write unit tests for `src/lib/tokens.ts` (verify token expiration detection `isTokenExpiring`).
- [x] Add testing scripts to `package.json` (`"test": "vitest run"`).
- [x] Verify test suite runs and passes.

### Phase 2: Security & Quality Enhancements
- [x] Implement **OAuth CSRF state validation**:
  - [x] Generate cryptographically secure `state` in `src/app/api/oauth/figma/auth/route.ts` and `src/app/api/oauth/miro/auth/route.ts`, and store it in an HTTP-only secure cookie.
  - [x] Retrieve and verify the `state` in `src/app/api/oauth/figma/callback/route.ts` and `src/app/api/oauth/miro/callback/route.ts` against the cookie, and then delete the cookie.
- [x] Secure token serialization:
  - [x] Update callback HTML pages to use `JSON.stringify` serialization rather than direct string interpolation.
- [x] Quality/Cleanups:
  - [x] Remove development `console.log` statements in `src/app/miro-plugin/useMiroSelection.ts`.
- [x] Verify compilation and lint status (`yarn lint` and `yarn build`).

### Phase 3: Automated Pre-Push Hooks Setup
- [x] Install `husky` as a dev dependency.
- [x] Run `npx husky init` to set up git hooks directory.
- [x] Update/Create `.husky/pre-push` script to run `yarn lint && yarn test && yarn build`.
- [x] Add `prepare` script to `package.json` for automatic husky installation.
- [x] Verify pre-push hook runs successfully by simulating a run.

### Phase 4: Verification & Changelog
- [x] Perform a clean build run check (`yarn build`).
- [x] Log changes in `doc/changelog.md`.

### Phase 5: Per-Image Customization (Format & Scale Selection)
- [x] Add **Default PNG Scale** dropdown to Settings Panel.
- [x] Add interactive dropdowns for **Format (PNG/SVG)** and **PNG Scale (1x-4x)** to the Sync Panel when an image is selected.
- [x] Save format/scale properties to Miro widget metadata dynamically on dropdown change.
- [x] Adjust `useMiroSelection` hook to read format/scale properties from metadata.
- [x] Update `useMiroSync` engine to group render calls by `fileKey` + `format` + `scale` to support mixed syncing.
- [x] Update backend `/api/figma/render-batch` and `/api/figma/render` to accept and process format/scale dynamically.
- [x] Update backend `/api/miro/update-image` to support SVG file types.
- [x] Run test suite and check compilation status (`yarn test` and `yarn build`).

### Phase 6: Penpot Sync Integration
- [x] Create Penpot design link URL parser (`src/app/miro-plugin/penpotUrlParser.ts`) and add comprehensive unit test suite.
- [x] Implement a pure-JS SSE transport MCP client (`src/app/miro-plugin/penpotMcpClient.ts`) to connect to the local Penpot MCP server.
- [x] Create the `usePenpotImporter.ts` hook to validate links, fetch active selections, and place SVG screens on the Miro canvas.
- [x] Group duplicate selected canvas items in the Sync panel and show a copies badge (`x3`) on the top-right. Update setting updates to write to all copies.
- [x] Update selection listener and sync hooks to identify and partition figma and penpot frames.
- [x] Update Miro update API route to output the correct `PenpotSync` title tag when updating Penpot widgets.
- [x] Patch the local Penpot MCP server (`PenpotMcpServer.ts`) to add CORS middleware, allowing local browser calls to `localhost:4401`.
- [x] Verify compilation and test suite status (`yarn test` and `yarn build`).

### Phase 7: Tauri Local HTTPS Bridge & Penpot Companion Plugin
- [x] Create detailed Tauri secure HTTPS loopback bridge and Penpot companion plugin specification artifact (`tauri_bridge_spec.md`).
- [x] Implement Penpot Companion Plugin script skeleton (`penpot-companion-plugin.html`) that handles WebSocket messaging and native exports.
- [x] Adapt client-side `penpotMcpClient.ts` to connect to `https://local.syncboard.com:4401` when the Tauri bridge is active, and remove redundant Penpot MCP server fallback code.
- [x] Add "SyncBridge" connection widgets and pairing status information to the Miro plugin Settings tab.
- [x] Document local SSL code-signing/trusted certificate installation steps inside `doc/tauri-setup.md`.

### Phase 8: Tauri Project Setup & Release Workflow
- [x] Initialize the Tauri app shell structure in `/tauri-bridge`.
- [x] Configure the Tauri Cargo dependencies (axum/warp, rustls, tokio-tungstenite).
- [x] Implement the secure local HTTPS loopback proxy server (Axum + Rustls).
- [x] Implement the WebSocket pairing router for Penpot connections.
- [x] Integrate local Figma Desktop selection forwarding (`/detect-figma`).
- [x] Create GitHub Actions workflow (`.github/workflows/release-tauri.yml`) for cross-platform binary compilation and release.
