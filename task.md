# Task: Standardize Figma Title Signature to `[FigmaSync|...]`

## Goal
Standardize widget title metadata tags so Figma uses `[FigmaSync|fileKey|nodeId]`, matching Penpot's `[PenpotSync|fileId|objectId]`.

## Target Files & Changes

1. `src/app/miro-plugin/useFigmaImporter.ts`
   - Update `titleTag` formatting from `[SyncBoard|${fileKey}|${nodeId}]` to `[FigmaSync|${fileKey}|${nodeId}]` (Lines 173 & 224).

2. `src/app/miro-plugin/useMiroSelection.ts`
   - Update regex matcher from `/^(.*?)\s*\[SyncBoard\|([^|]+)\|([^\]]+)\]$/` to `/^(.*?)\s*\[FigmaSync\|([^|]+)\|([^\]]+)\]$/` (Line 108).
   - Update fallback tag ternary from `platform === 'penpot' ? 'PenpotSync' : 'SyncBoard'` to `platform === 'penpot' ? 'PenpotSync' : 'FigmaSync'` (Line 177).

3. `src/app/miro-plugin/useMiroPlugin.ts`
   - Update tag ternary to use `'FigmaSync'` instead of `'SyncBoard'` (Line 272).

4. `src/app/miro-plugin/useMiroSync.ts`
   - Update tag ternaries to use `'FigmaSync'` instead of `'SyncBoard'` (Lines 107 & 395).

5. `doc/CHANGELOG.md`
   - Document the standardization under v0.13.5 additions.

## Verification Plan
1. `yarn build` - verify TypeScript compilation.
2. `yarn test` - verify test suite passes.
