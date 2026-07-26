# Task Tracker — Architecture Documentation Update (2026-07-26)

Update `doc/architecture.md` based on audit findings comparing `v0.13.3` codebase against spec.

## Phase 1 — Non-Destructive Spec Updates in `doc/architecture.md`
- [x] Update header date to `2026-07-26` and version baseline `v0.13.3`
- [x] Update Status Index & Overview Table to accurately mark MCP Transport Layer as `draft / planned (not implemented in v0.13.3)`
- [x] Add clarification note to Source Adapters section regarding `SyncSourceAdapter` interface target vs. current hook/route implementation
- [x] Update Target Adapters (Miro) section to document `preserveSize` (geometry preservation) and `replaceSelectedWidget` (widget adoption & retargeting)
- [x] Clarify MCP Transport & MCP Server sections (Section 3A/3B) to reflect planned status (noting missing `@modelcontextprotocol/sdk` and `/api/mcp` route)
- [x] Document token-hash rate-limiting architecture in Section 7 (`tok:sha256(token)` and `relay:sha256(pairingId)`)
- [x] Document live node-name refresh behavior in Section 5 & 6

## Phase 2 — Changelog & Verification
- [x] Add entry to `doc/CHANGELOG.md` under testing/docs phase
- [x] Verify `doc/architecture.md` readability and markdown formatting
- [x] Run `yarn build` to ensure no accidental codebase build regressions

## Phase 3 — Additional Architecture Documentation Enhancements
- [x] Document Stateless OAuth Store & Popup Handshake (`/api/oauth/store`, 300s TTL) in Appendix A
- [x] Document Cryptographically Secure Pairing IDs (`sb_` + 16 chars) & UI masking in Section 4
- [x] Document HTML Entity Sanitization (`decodeHtmlEntities`) in Section 5
- [x] Update `doc/CHANGELOG.md`
- [x] Re-verify with `yarn build`
