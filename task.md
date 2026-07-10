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
