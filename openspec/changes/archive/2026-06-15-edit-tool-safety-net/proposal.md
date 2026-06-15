## Why

The edit tool's hash-anchor protocol is powerful but fragile: agents construct edit calls blind and only discover failures (stale anchors, brace imbalance, ambiguous hashes) after the tool rejects them. In eval session 00MQC73N, ~200 messages were wasted on edit tool failures — the agent repeatedly hit `anchor_context_ambiguous`, `safety_check_failed`, and corrupted file states with no recovery path. Adding a dry-run validation mode and snapshot/rollback mechanism eliminates this failure cascade without changing the existing edit protocol.

## What Changes

- **edit dry-run mode**: New optional parameter `dry_run: true` that validates all operations in a batch against the current file snapshot — resolving anchors, checking safety (braces/parens/tags), detecting conflicts — and returns per-operation diagnostics WITHOUT modifying the file. The agent can iterate on the edit call until diagnostics are clean, then remove `dry_run` to apply.
- **edit snapshot / rollback**: Before applying a batch, the edit tool automatically saves a snapshot of the affected file region. A new `edit_undo` tool restores the last snapshot, giving the agent a recovery path when edits produce unexpected results (duplicate code, missing elements, corrupted syntax).
- **post-edit syntax validation**: After successfully applying an edit batch to a `.js`, `.ts`, `.jsx`, `.tsx`, `.css`, `.html`, or `.json` file, the tool runs a lightweight syntax check and reports any parse errors with line numbers. Catches errors like `Unexpected token ':'` before the agent wastes turns on browser testing.
- **read_file anchor recommendations**: `read_file(hashes: true)` already classifies lines as low/med/high quality. Extend the output to include a `recommended_anchors` section listing 3-5 high-quality, unique anchor lines with their hashes — giving the agent explicit targets instead of forcing it to guess which lines are safe to anchor on.

## Capabilities

### New Capabilities

- `edit-dry-run`: Pre-flight validation of edit operations — resolves anchors, runs safety checks, returns per-operation diagnostics — without modifying the file. The agent uses this to verify an edit batch before committing it.
- `edit-snapshot-rollback`: Automatic pre-edit snapshots plus an `edit_undo` tool that restores the file to its pre-batch state. Provides a recovery path when edits produce corrupted or unexpected results.
- `post-edit-validate`: Lightweight syntax validation of edited files (JS/TS/CSS/HTML/JSON) after successful edit application. Reports parse errors with line numbers so the agent can fix them before browser testing.

### Modified Capabilities

- `edit-diagnostic-enhancement`: Extends the existing safety check to also run in dry-run mode. When `dry_run: true`, safety diagnostics are returned as part of the validation result rather than as an error rejection. The `safety_check` parameter remains unchanged in behavior for non-dry-run calls.
- `hashline-read`: Extends `read_file(hashes: true)` output to include a `recommended_anchors` field — a curated list of high-quality, unique anchor lines the agent should prefer for edit operations.

## Impact

- **edit tool implementation** (`src/tools/edit.ts` or equivalent): New `dry_run` parameter, snapshot capture before apply, `edit_undo` tool registration
- **tool registry**: New `edit_undo` tool entry
- **post-edit validation**: New utility module for lightweight syntax checking (can leverage existing parser infrastructure or use regex-based validation for JS/TS/CSS/HTML/JSON)
- **read_file tool** (`src/tools/read_file.ts` or equivalent): New `recommended_anchors` output field
- **No breaking changes**: All additions are opt-in (new parameters, new tool). Existing edit behavior is unchanged.
