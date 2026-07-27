# Task Tracker: SyncBoard Architectural Modernization & Docs Refactoring

- [x] Exact TOC Heading Slug Parity with `github-slugger` (`src/lib/docs.ts`)
- [x] Glow Shadow Removal & WCAG Contrast Improvements
- [x] Minimal Status Dots for Card Pills & Tags
- [x] Modern Code Block, Inline Code, and Syntax Highlighting Visual Overhaul (`src/app/globals.css`)
- [x] Verification (`yarn build` static prerendering & `yarn test` 63 vitest assertions)

### Phase 1: Relevancy Scoring & Hierarchy Engine (`src/lib/docs.ts`)
- [ ] Implement weighted relevancy scoring: Title (+100), Heading (+50), Description (+30), Body (+10).
- [ ] Implement category hierarchy weighting: Getting Started (0), Architecture (-10), Reference (-20), Historical Archives (-60).
- [ ] Ensure Historical Archives rank lowest in all search results.

### Phase 2: Interactive Search Component & Filter Removal
- [ ] Upgrade `DocSearchInput.tsx` with Relevancy Badges, Category Hierarchy headers, and `Cmd+K` keyboard shortcut.
- [ ] Remove duplicate in-page filter input from `DocsIndexClient.tsx` body so search is unified.
- [ ] Verify `yarn build` and `yarn test`.build` static prerendering & `yarn test` 63 vitest assertions)
