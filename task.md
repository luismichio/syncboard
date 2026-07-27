# Task Tracker: SyncBoard Architectural Modernization & Docs Refactoring

## Active Tasks
- [x] Hydration Mismatch Fix (`src/app/layout.tsx` `suppressHydrationWarning`)
- [x] Miro Standalone Connection Guarding (`useMiroSelection.ts`, `useMiroSync.ts`)
- [x] Dual-Link Compatibility Transformer (`rehypeDocLinks` in `src/app/docs/[slug]/page.tsx`)
- [x] Modular Architecture Docs Split (`doc/architecture/` subfolder & master index)
- [x] Features & Video Showcase Page (`doc/features.md`)
- [x] Subdirectory Scanner & Description Extractor (`src/lib/docs.ts`)
- [x] Re-architect `/docs` UI Components & 4-Tier Hierarchy Layout (`DocsIndexClient.tsx`, `DocCard.tsx`, `DocSectionHeader.tsx`, `DocSearchInput.tsx`)
- [x] Replace Emojis with Lucide Outline Vector Icons (`strokeWidth="1.5"`)
- [x] Add Explicit YAML Frontmatter Descriptions to all Architecture Documents
- [x] Exact TOC Heading Slug Parity with `github-slugger` (`src/lib/docs.ts`)
- [x] Glow Shadow Removal & WCAG Contrast Improvements
- [x] Minimal Status Dots for Card Pills & Tags
- [x] Modern Code Block, Inline Code, and Syntax Highlighting Visual Overhaul (`src/app/globals.css`)
- [x] Verification (`yarn build` static prerendering & `yarn test` 63 vitest assertions)
