# Bug Log (`replica-test`)

## Fixed During QA Loop

### BUG-001 (S2 — Fixed)
- **Summary**: React `StrictMode` double-invocation caused `ensureSeedWorkspace()` to insert starter documents twice on fresh IndexedDB initialization.
- **Fix**: Added a singleton `seedPromise` guard and synchronous `localStorage` flag in `src/lib/storage.ts`.
- **Verification**: Playwright `F01` test passes with zero duplicate cards.

### BUG-002 (S2 — Fixed)
- **Summary**: `handleReplaceAll` in `EditorScreen.tsx` previously serialized HTML through `DOMParser`, which did not reliably dispatch an in-place ProseMirror transaction when cursor was inside table cells.
- **Fix**: Rewrote `handleReplaceAll` to walk `editor.state.doc.descendants` and dispatch an atomic ProseMirror transaction from end to start (preserving undo history, marks, and table cells).
- **Verification**: Playwright `F05` test passes.

## Open Bugs
- None (0 S1, 0 S2, 0 S3, 0 S4).
