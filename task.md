# Task: Implement Interactive Quick Start Section & Vercel Deploy Integration on `/docs`

## Phase 1: Planning & Component Design
- [x] Analyze `/docs` layout in `src/app/docs/DocsIndexClient.tsx`
- [x] Design `QuickStartSection.tsx` component with tabbed Community vs. Self-Hosted guides
- [x] Construct 1-click Vercel Deploy URL with required environment variable pre-population

## Phase 2: Implementation
- [x] Create `src/components/docs/QuickStartSection.tsx` with interactive tabs, direct Miro install URL, and Vercel Deploy button
- [x] Integrate `QuickStartSection` in `src/app/docs/DocsIndexClient.tsx` below hero search bar
- [x] Add Vercel Deploy button badge to `README.md` and `doc/setup.md`

## Phase 3: Verification & Changelog
- [x] Verify TypeScript types with `npx tsc --noEmit`
- [x] Document updates in `doc/CHANGELOG.md`
